var https = require('https');
var url = require('url');
var fs =require('fs');
var settings = require('./settings');
var msg;

console.log(settings);

var options = {
    key:  fs.readFileSync(settings.key_path),
    cert: fs.readFileSync(settings.cert_path)
};

var server = https.createServer(options, function(req, res) {
    var path = url.parse(req.url);
    // extension
    var ext = path.pathname.split('.');
    if (ext.length < 2) ext = '';
    else ext = ext[ext.length - 1];
    // pathname
    fs.readFile(__dirname + path.pathname, 'utf-8', function(err, data) {
        if(err){
            res.writeHead(404, {'Content-Type': 'text/plain'});
            res.write('404: File Not Found');
            return res.end();
        }
        switch (ext.toLowerCase()) {
        case 'html':
            res.writeHead(200, {'Content-Type': 'text/html'});
            break;
        case 'js':
            res.writeHead(200, {'Content-Type': 'text/javascript'});
            break;
        case 'ico':
            res.writeHead(200, {'Content-Type': 'image/x-icon'});
            break;
        default:
            res.writeHead(200, {'Content-Type': 'unknown/unknown'});
            break;
        }
        res.write(data);
        return res.end();
    });
});
server.listen(settings.port);
