/***
 * Copyright (C) 2018 Qli5. All Rights Reserved.
 *
 * @author qli5 <goodlq11[at](163|gmail).com>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * The FLV merge utility is a Javascript translation of
 * https://github.com/grepmusic/flvmerge
 * by grepmusic
 */
class TwentyFourDataView extends DataView {
  getUint24(byteOffset, littleEndian) {
    if (littleEndian) throw 'littleEndian int24 not implemented'
    return this.getUint32(byteOffset - 1) & 0x00ffffff
  }

  setUint24(byteOffset, value, littleEndian) {
    if (littleEndian) throw 'littleEndian int24 not implemented'
    if (value > 0x00ffffff) throw 'setUint24: number out of range'
    let msb = value >> 16
    let lsb = value & 0xffff
    this.setUint8(byteOffset, msb)
    this.setUint16(byteOffset + 1, lsb)
  }

  indexOf(
    search,
    startOffset = 0,
    endOffset = this.byteLength - search.length + 1
  ) {
    // I know it is NAIVE
    if (search.charCodeAt) {
      for (let i = startOffset; i < endOffset; i++) {
        if (this.getUint8(i) != search.charCodeAt(0)) continue
        let found = 1
        for (let j = 0; j < search.length; j++) {
          if (this.getUint8(i + j) != search.charCodeAt(j)) {
            found = 0
            break
          }
        }
        if (found) return i
      }
      return -1
    } else {
      for (let i = startOffset; i < endOffset; i++) {
        if (this.getUint8(i) != search[0]) continue
        let found = 1
        for (let j = 0; j < search.length; j++) {
          if (this.getUint8(i + j) != search[j]) {
            found = 0
            break
          }
        }
        if (found) return i
      }
      return -1
    }
  }
}

class FLVTag {
  constructor(dataView, currentOffset = 0) {
    this.tagHeader = new TwentyFourDataView(
      dataView.buffer,
      dataView.byteOffset + currentOffset,
      11
    )
    this.tagData = new TwentyFourDataView(
      dataView.buffer,
      dataView.byteOffset + currentOffset + 11,
      this.dataSize
    )
    this.previousSize = new TwentyFourDataView(
      dataView.buffer,
      dataView.byteOffset + currentOffset + 11 + this.dataSize,
      4
    )
  }

  get tagType() {
    return this.tagHeader.getUint8(0)
  }

  get dataSize() {
    return this.tagHeader.getUint24(1)
  }

  get timestamp() {
    return this.tagHeader.getUint24(4)
  }

  get timestampExtension() {
    return this.tagHeader.getUint8(7)
  }

  get streamID() {
    return this.tagHeader.getUint24(8)
  }

  stripKeyframesScriptData() {
    let hasKeyframes = 'hasKeyframes\x01'
    let keyframes = '\x00\x09keyframs\x03'
    if (this.tagType != 0x12) throw "can not strip non-scriptdata's keyframes"

    let index
    index = this.tagData.indexOf(hasKeyframes)
    if (index != -1) {
      //0x0101 => 0x0100
      this.tagData.setUint8(index + hasKeyframes.length, 0x00)
    }

    // Well, I think it is unnecessary
    /*index = this.tagData.indexOf(keyframes)
      if (index != -1) {
          this.dataSize = index;
          this.tagHeader.setUint24(1, index);
          this.tagData = new TwentyFourDataView(this.tagData.buffer, this.tagData.byteOffset, index);
      }*/
  }

  getDuration() {
    if (this.tagType != 0x12) throw "can not find non-scriptdata's duration"

    let duration = 'duration\x00'
    let index = this.tagData.indexOf(duration)
    if (index == -1) throw 'can not get flv meta duration'

    index += 9
    return this.tagData.getFloat64(index)
  }

  getDurationAndView() {
    if (this.tagType != 0x12) throw "can not find non-scriptdata's duration"

    let duration = 'duration\x00'
    let index = this.tagData.indexOf(duration)
    if (index == -1) throw 'can not get flv meta duration'

    index += 9
    return {
      duration: this.tagData.getFloat64(index),
      durationDataView: new TwentyFourDataView(
        this.tagData.buffer,
        this.tagData.byteOffset + index,
        8
      )
    }
  }

  getCombinedTimestamp() {
    return (this.timestampExtension << 24) | this.timestamp
  }

  setCombinedTimestamp(timestamp) {
    if (timestamp < 0) throw 'timestamp < 0'
    this.tagHeader.setUint8(7, timestamp >> 24)
    this.tagHeader.setUint24(4, timestamp & 0x00ffffff)
  }
}

/**
 * A simple flv parser
 */
class FLV {
  constructor(dataView) {
    if (dataView.indexOf('FLV', 0, 1) != 0) throw 'Invalid FLV header'
    this.header = new TwentyFourDataView(
      dataView.buffer,
      dataView.byteOffset,
      9
    )
    this.firstPreviousTagSize = new TwentyFourDataView(
      dataView.buffer,
      dataView.byteOffset + 9,
      4
    )

    this.tags = []
    let offset = this.headerLength + 4
    while (offset < dataView.byteLength) {
      let tag = new FLVTag(dataView, offset)
      // debug for scrpit data tag
      // if (tag.tagType != 0x08 && tag.tagType != 0x09)
      offset += 11 + tag.dataSize + 4
      this.tags.push(tag)
    }

    if (offset != dataView.byteLength) throw 'FLV unexpected end of file'
  }

  get type() {
    return 'FLV'
  }

  get version() {
    return this.header.getUint8(3)
  }

  get typeFlag() {
    return this.header.getUint8(4)
  }

  get headerLength() {
    return this.header.getUint32(5)
  }

  static merge(flvs) {
    if (flvs.length < 1) throw 'Usage: FLV.merge([flvs])'
    let blobParts = []
    let basetimestamp = [0, 0]
    let lasttimestamp = [0, 0]
    let duration = 0.0
    let durationDataView

    blobParts.push(flvs[0].header)
    blobParts.push(flvs[0].firstPreviousTagSize)

    for (let flv of flvs) {
      let bts = duration * 1000
      basetimestamp[0] = lasttimestamp[0]
      basetimestamp[1] = lasttimestamp[1]
      bts = Math.max(bts, basetimestamp[0], basetimestamp[1])
      let foundDuration = 0
      for (let tag of flv.tags) {
        if (tag.tagType == 0x12 && !foundDuration) {
          duration += tag.getDuration()
          foundDuration = 1
          if (flv == flvs[0]) {
            ;({ duration, durationDataView } = tag.getDurationAndView())
            tag.stripKeyframesScriptData()
            blobParts.push(tag.tagHeader)
            blobParts.push(tag.tagData)
            blobParts.push(tag.previousSize)
          }
        } else if (tag.tagType == 0x08 || tag.tagType == 0x09) {
          lasttimestamp[tag.tagType - 0x08] = bts + tag.getCombinedTimestamp()
          tag.setCombinedTimestamp(lasttimestamp[tag.tagType - 0x08])
          blobParts.push(tag.tagHeader)
          blobParts.push(tag.tagData)
          blobParts.push(tag.previousSize)
        }
      }
    }
    durationDataView.setFloat64(0, duration)

    return new Blob(blobParts)
  }

  static async mergeBlobs(blobs) {
    // Blobs can be swapped to disk, while Arraybuffers can not.
    // This is a RAM saving workaround. Somewhat.
    if (blobs.length < 1) throw 'Usage: FLV.mergeBlobs([blobs])'
    let ret = []
    let basetimestamp = [0, 0]
    let lasttimestamp = [0, 0]
    let duration = 0.0
    let durationDataView

    for (let blob of blobs) {
      let bts = duration * 1000
      basetimestamp[0] = lasttimestamp[0]
      basetimestamp[1] = lasttimestamp[1]
      bts = Math.max(bts, basetimestamp[0], basetimestamp[1])
      let foundDuration = 0

      let flv = await new Promise((resolve, reject) => {
        let fr = new FileReader()
        fr.onload = () => resolve(new FLV(new TwentyFourDataView(fr.result)))
        fr.readAsArrayBuffer(blob)
        fr.onerror = reject
      })

      let modifiedMediaTags = []
      for (let tag of flv.tags) {
        if (tag.tagType == 0x12 && !foundDuration) {
          duration += tag.getDuration()
          foundDuration = 1
          if (blob == blobs[0]) {
            ret.push(flv.header, flv.firstPreviousTagSize)
            ;({ duration, durationDataView } = tag.getDurationAndView())
            tag.stripKeyframesScriptData()
            ret.push(tag.tagHeader)
            ret.push(tag.tagData)
            ret.push(tag.previousSize)
          }
        } else if (tag.tagType == 0x08 || tag.tagType == 0x09) {
          lasttimestamp[tag.tagType - 0x08] = bts + tag.getCombinedTimestamp()
          tag.setCombinedTimestamp(lasttimestamp[tag.tagType - 0x08])
          modifiedMediaTags.push(tag.tagHeader, tag.tagData, tag.previousSize)
        }
      }
      ret.push(new Blob(modifiedMediaTags))
    }
    durationDataView.setFloat64(0, duration)

    return new Blob(ret)
  }
}
