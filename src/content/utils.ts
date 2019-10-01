export function copyText(str: string) {
  var text = $(
    '<textarea style="width: 0;height: 0;" id="copy_tmp">' + str + '</textarea>'
  )
  $('body').append(text)
  text.select()
  document.execCommand('Copy')
  $('#copy_tmp').remove()
}

// fetch 实时进度功能
function isFetchProgressSupported() {
  return (
    typeof Response !== 'undefined' && typeof ReadableStream !== 'undefined'
  )
}
export function fetchProgress({
  defaultSize = 0,
  onProgress = (progress: number) => {}
}) {
  return function(response: Response) {
    if (!isFetchProgressSupported()) {
      return response
    }
    const { body, headers } = response

    const reader = body.getReader()
    const contentLength = parseInt(headers.get('content-length')) || defaultSize
    let bytesReceived = 0
    let progress = 0

    return new Promise((resolve, reject) => {
      const stream = new ReadableStream({
        start(controller) {
          function push() {
            reader
              .read()
              .then(({ done, value }) => {
                if (done) {
                  controller.close()
                  onProgress(1)
                  resolve(new Response(stream, { headers }))
                }
                if (value) {
                  bytesReceived += value.length

                  if (contentLength) {
                    progress = bytesReceived / contentLength
                  }
                  onProgress(progress)
                }
                controller.enqueue(value)
                push()
              })
              .catch((err: Error) => {
                reject(err)
              })
          }
          push()
        }
      })
    })
  }
}