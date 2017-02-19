
// media source
var g_mediaSrc = new MediaSource();
var g_dstVideo = document.querySelector("#receivedvideo");
var g_sourceBuf = null;
var g_dataBuf = new Uint8Array();
g_mediaSrc.addEventListener("sourceopen", onSourceOpen, false);
if (g_dstVideo.hasOwnProperty("srcObject")) {
    g_dstVideo.srcObject = g_mediaSrc;
} else {
    g_dstVideo.src = window.URL.createObjectURL(g_mediaSrc);
}

function onSourceOpen(event) {
    console.log("onsourceopen");
    g_sourceBuf = g_mediaSrc.addSourceBuffer('video/webm; codecs="vp9, opus"');
    g_sourceBuf.addEventListener("updateend", onUpdateEnd, false);
    var timerId = setInterval(function(event) {
        if (g_dataBuf.length > 100000) {
            clearInterval(timerId);
//            g_sourceBuf.appendBuffer(g_dataBuf.buffer);
//            g_dataBuf = new Uint8Array(0);
            appendInitSegment();
        }
    }, 1000);

    g_sourceBuf.addEventListener("error", function(ev) {
        console.log(ev);
    }, false);
};

var g_bUpdateend = false;

function onUpdateEnd(event) {
    console.log("updateend", g_dataBuf.length);
//    if (g_dataBuf.length > 0) {
//    console.log(g_dataBuf.buffer);
//        g_sourceBuf.appendBuffer(g_dataBuf.buffer);
//        g_mediaSrc.endOfStream();
//        g_dstVideo.play();
//        g_dataBuf = new Uint8Array(0);
//    }

//    appendMediaSegment();

    g_bUpdateend = true;
};

// get user media
var g_stream = null;
navigator.getUserMedia =
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia;
if (navigator.getUserMedia) {
    navigator.getUserMedia(
        {
            audio: true,
            video: { width: 1280, height: 720 }
        },
        function(stream) {
            g_stream = stream;
            var video = document.querySelector('#webcameravideo');
            video.src = window.URL.createObjectURL(stream);
            video.onloadedmetadata = function(e) {
                video.play();
            };
        },
        function(err) {
            console.error("The following error occurred: " + err.name);
        }
    );
} else {
    console.error("getUserMedia not supported");
}


var g_mediaRec = null;
var g_chunks = [];
var g_timerId = setInterval(function() {
    if (g_stream != null) {
        clearInterval(g_timerId);
        g_mediaRec = new MediaRecorder(g_stream, {mimeType: 'video/webm; codecs="vp9, opus"'});
        var count = 0;
        g_mediaRec.ondataavailable = function(e) {
            var fr = new FileReader();
            fr.onload = function(fr_e) {
                var curBuf = g_dataBuf;
                var newBuf = new Uint8Array(fr_e.currentTarget.result);
                var length = curBuf.length + newBuf.length;
                g_dataBuf = new Uint8Array(length);
                g_dataBuf.set(curBuf, 0);
                g_dataBuf.set(newBuf, curBuf.length);
                console.log(g_dataBuf.length);
                //
                if (g_bUpdateend) appendMediaSegment();
                //
            };
            fr.readAsArrayBuffer(e.data);

        };
        g_mediaRec.start(500);
    }
}, 1000);


///////////

var ptr = 0;

var tagEBML = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
var tagSegment = new Uint8Array([0x18, 0x53, 0x80, 0x67]);
var tagCluster = new Uint8Array([0x1f, 0x43, 0xb6, 0x75]);
var tagVoid = new Uint8Array([0xec]);

// 配列(ArrayBufferView)が合致しているかどうかを比較
function equal(a, b) {
    if(a.byteLength != b.byteLength)
        return false;
    for(var i = 0 ; i < a.byteLength ; i++) {
        if(a[i] != b[i])
            return false;
    }
    return true;
}

// WebMフォーマットのElementサイズを計算
function getElementSize(d, p) {
    var l = 0;
    var n = d[p];
    var j;
    var t = 0;
    for(var i = 0 ; i < 8 ; i++) {
        if((n >> (7-i)) > 0) {
            j = i;
            break;
        }
    }
    for(var i = 0 ; i <= j ; i++) {
        var b = d[p + t];
        if(i == 0)
            b -= (1 << 7-j);
        l = l * 256 + b;
        t++;
    }
    return { length: l, offset: t };
}

// WebMファイルの先頭から初期化セグメントを取り出してSourceBufferに渡す
function appendInitSegment() {
    var r;
    if(!equal(tagEBML, g_dataBuf.subarray(ptr, ptr + tagEBML.byteLength))) {
        console.error('webm data error');
        return;
    }
    ptr += tagEBML.byteLength;
    r = getElementSize(g_dataBuf, ptr);
    ptr += r.offset + r.length;
    if(!equal(tagSegment, g_dataBuf.subarray(ptr, ptr + tagSegment.byteLength))) {
        alert('webm data error');
        return;
    }
    ptr += tagSegment.byteLength;
    r = getElementSize(g_dataBuf, ptr);
    ptr += r.offset;
    
    // Cluster手前までを検索
    while(!equal(tagCluster, g_dataBuf.subarray(ptr, ptr + tagCluster.byteLength))) {
        if(equal(tagVoid, g_dataBuf.subarray(ptr, ptr + tagVoid.byteLength)))
            ptr += tagVoid.byteLength;
        else
            ptr += tagCluster.byteLength;
        r = getElementSize(g_dataBuf, ptr);
        ptr += r.offset + r.length;
    }
    // 初期化セグメント = G_DataBufファイルの先頭から最初のClusterの直前まで
    var initSeg = new Uint8Array(g_dataBuf.subarray(0, ptr));
    g_sourceBuf.appendBuffer(initSeg.buffer);
    
    // とりあえずバッファは消さずに様子を見よう
//    g_dataBuf = g_dataBuf.subarray(ptr);
}

// Clusterを取り出してメディアセグメントとしてSourceBufferに渡す
function appendMediaSegment() {
    var start = ptr;
    
    // Clusterを最後まで読み終われば終了
    var tmp = g_dataBuf.subarray(ptr, ptr + tagCluster.byteLength);
    if(!equal(tagCluster, g_dataBuf.subarray(ptr, ptr + tagCluster.byteLength)))
        return;
    
    ptr += tagCluster.byteLength;
    var r = getElementSize(g_dataBuf, ptr);
    ptr += r.offset + r.length;

    //
    console.log("appendMediaSegment");
    if (ptr > g_dataBuf.length) return;
    g_bUpdateend = false;
    //

    var mediaSeg = new Uint8Array(g_dataBuf.subarray(start, ptr));
    g_sourceBuf.appendBuffer(mediaSeg.buffer);

}
