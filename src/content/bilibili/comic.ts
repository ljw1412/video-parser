import { getExtensionURL, sendMessage } from '../utils'
import { saveAs } from 'file-saver'
import JSZip from 'jszip'

export default class BilibiliComic {
  constructor() {}

  init() {
    const _this = this
    setTimeout(() => {
      $('.episode-list .list-data .list-item').each(function() {
        $(this)
          .find('.short-title')
          .css({ width: 'calc(100% - 46px)' })
        if (!$(this).find('.locked').length) {
          $(this).append(
            $(
              '<div class="download-button"><svg class="icon" style="width: 1em; height: 1em;vertical-align: middle;fill: currentColor;overflow: hidden;" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2173"><path d="M767.552304 255.903298l-95.945189 0c-17.662265 0-31.980365 14.3181-31.980365 31.980365 0 17.662265 14.3181 31.980365 31.980365 31.980365l64.218604 0c17.520025 0 31.722492 14.202467 31.722492 31.722492l0 448.239837c0 17.520025-14.202467 31.722492-31.722492 31.722492L223.62515 831.54885c-17.520025 0-31.722492-14.202467-31.722492-31.722492L191.902658 351.585497c0-17.520025 14.202467-31.722492 31.722492-31.722492l64.207347 0 0 0c0.004093 0 0.007163 0 0.011256 0 17.662265 0 31.980365-14.3181 31.980365-31.980365 0-17.662265-14.3181-31.980365-31.980365-31.980365-0.004093 0-0.007163 0-0.011256 0l0 0-95.933933 0c-35.322483 0-63.956637 28.634154-63.956637 63.956637l0 511.693008c0 35.322483 28.634154 63.956637 63.956637 63.956637l575.653739 0c35.322483 0 63.956637-28.634154 63.956637-63.956637L831.508941 319.859935C831.508941 284.537452 802.874787 255.903298 767.552304 255.903298zM310.382073 457.076086c-12.388145-12.388145-32.473599-12.388145-44.862767 0l-0.364297 0.364297c-12.388145 12.388145-12.388145 32.473599 0 44.862767l190.186574 190.186574c5.818519 6.813173 14.465456 11.137665 24.12649 11.137665l0.148379 0c0.002047 0 0.00307 0 0.005117 0l0.208754 0c0.002047 0 0.00307 0 0.005117 0l0.148379 0c9.662057 0 18.307971-4.324492 24.12649-11.137665L694.296883 502.30315c12.388145-12.388145 12.388145-32.473599 0-44.862767l-0.364297-0.364297c-12.388145-12.388145-32.473599-12.388145-44.862767 0L511.706311 594.439594 511.706311 95.743598c0-17.520025-14.202467-31.722492-31.722492-31.722492l-0.515746 0c-17.520025 0-31.722492 14.202467-31.722492 31.722492l0 498.695996L310.382073 457.076086z" p-id="2578"></path></svg></div>'
            )
          )
        }
      })

      const cssURL = getExtensionURL('css/bilibiliComic.css')
      $('head').append(
        `<link  rel="stylesheet" type="text/css" href="${cssURL}"/>`
      )
      console.log('漫画下载按钮添加完毕')

      $('.download-button').click(function(e) {
        e.stopPropagation()
        const data = $(this)
          .parent('.list-item')
          .data('bili-manga-msg')
        if (data) {
          _this.fetchIndex(data.manga_id, Number(data.manga_num))
        }
      })
    }, 300)
  }

  setData() {}

  fetchIndex(comic_id: number, ep_id: number) {
    fetch(
      'https://manga.bilibili.com/twirp/comic.v1.Comic/GetImageIndex?device=pc&platform=web',
      {
        method: 'Post',
        body: JSON.stringify({ ep_id }),
        headers: {
          'content-type': 'application/json'
        },
        credentials: 'same-origin'
      }
    )
      .then(response => response.json())
      .then(({ data }) => data.host + data.path)
      .then(fetch)
      .then(response => response.arrayBuffer())
      .then(arrayBuffer =>
        String.fromCharCode.apply(null, new Uint8Array(arrayBuffer))
      )
      .then(data => {
        const indexDataParser = new IndexDataParser(comic_id, ep_id, data)
        return indexDataParser.parse()
      })
      .then(data => JSON.parse(data))
      .then(json => {
        console.log('获取相关漫画地址', json)
        return this.fetchImageList(json.pics)
      })
      .then(({ data }) =>
        data.map(
          (item: { url: string; token: string }) =>
            item.url + '?token=' + item.token
        )
      )
      .then(data => {
        this.downloadZip(data)
      })
      .catch(error => {
        console.error(error)
      })
  }

  fetchImageList(urlList: string[]) {
    return fetch(
      'https://manga.bilibili.com/twirp/comic.v1.Comic/ImageToken?device=pc&platform=web',
      {
        method: 'Post',
        body: JSON.stringify({ urls: JSON.stringify(urlList) }),
        headers: {
          'content-type': 'application/json'
        },
        credentials: 'same-origin'
      }
    ).then(response => response.json())
  }

  downloadZip(urlList: string[]) {
    console.log(urlList)
    return new Promise((resolve, reject) => {
      const zip = new JSZip()
      let count = 0
      for (let i = 0, len = urlList.length; i < len; i++) {
        fetch(urlList[i])
          .then(response => response.blob())
          .then(blob => {
            zip.file(`${i}.jpg`, blob)
            count++
            if (count === len - 1) {
              resolve()
              zip.generateAsync({ type: 'blob' }).then(content => {
                saveAs(content, 'example.zip')
              })
            }
          })
      }
    })
  }
}

class IndexDataParser {
  // 漫画id
  seasonId: number
  // 集数id
  episodeId: number
  // 索引头字节
  head = [66, 73, 76, 73, 67, 79, 77, 73, 67]
  headLength = this.head.length
  // 加密的索引文件
  dataIndex: string
  // 密钥
  key: Uint8Array

  constructor(seasonId: number, episodeId: number, dataIndex: string) {
    if (!this.isNumber(seasonId) || !this.isNumber(episodeId)) {
      throw new TypeError(
        '[Indexer] Both seasonId and episodeId should be number.'
      )
    } else {
      this.seasonId = seasonId
      this.episodeId = episodeId
      this.dataIndex = dataIndex
      this.key = this.getKey()
    }
  }

  isNumber(value: any) {
    return 'number' == typeof value
  }

  dataIndexToU8Array(dataIndex: string) {
    let str
    try {
      str = atob(dataIndex.split(',')[1] || dataIndex)
    } catch (error) {
      str = dataIndex
    }

    const arrayBuffer = new ArrayBuffer(str.length)
    const uint8Array = new Uint8Array(arrayBuffer)

    for (let i = 0; i < str.length; i++) {
      uint8Array[i] = str.charCodeAt(i)
    }

    return uint8Array
  }

  checkValid(uint8Array: Uint8Array) {
    for (let i = 0; i < this.headLength; i++) {
      if (uint8Array[i] !== this.head[i]) {
        return false
      }
    }
    return true
  }

  getKey() {
    const n = new Uint8Array(new ArrayBuffer(8))
    n[0] = this.episodeId
    n[1] = this.episodeId >> 8
    n[2] = this.episodeId >> 16
    n[3] = this.episodeId >> 24
    n[4] = this.seasonId
    n[5] = this.seasonId >> 8
    n[6] = this.seasonId >> 16
    n[7] = this.seasonId >> 24
    return n
  }

  offset(uint8Array: Uint8Array, key = this.key) {
    for (let n = 0; n < uint8Array.length; n++)
      uint8Array[n] = uint8Array[n] ^ key[n % 8]
  }

  parse() {
    let uint8Array = this.dataIndexToU8Array(this.dataIndex)
    if (!uint8Array.length || !this.checkValid(uint8Array)) {
      throw new TypeError('[Indexer] Invalid index data.')
    }
    uint8Array = uint8Array.slice(this.headLength)
    this.offset(uint8Array)
    var zip = new JSZip()
    return zip.loadAsync(uint8Array).then(zip => {
      const dat = zip.files['index.dat']
      if (!dat) {
        throw new Error('[Indexer] Can not find file "' + uint8Array + '".')
      }
      return dat.async('text')
    })
  }
}