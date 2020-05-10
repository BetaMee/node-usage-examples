import http from 'http'

// 解析 Get 请求
const handleGetRequestForData = (response: http.ServerResponse) => {
    response.writeHead(200,{
        'Content-Type': 'text/plain'
    });
    response.end('响应Get内容');
}

// 解析 Post 请求
const handlePostRequestForData = (response: http.ServerResponse) => {
    response.writeHead(200,{
        'Content-Type': 'text/plain'
    });
    response.end('响应Post内容');
}

const server = http.createServer((request, response) => {
    // 获取请求信息
    const {
        method,
        url
    } = request


    if (url === '/get' && method === 'GET') {
        handleGetRequestForData(response)
    } else if (url === '/post' && method === 'POST') {
        handlePostRequestForData(response)
    } else {
        response.writeHead(200,{
            'Content-Type': 'text/plain'
        });
        response.end('nothing');
    }
})

server
    .listen(8080, () => {
        console.log('BasicHttp Example is running on port 8080!')
    })
