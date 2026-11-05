@echo off
title OpoGestion A2
cd /d "%~dp0"
echo Iniciando OpoGestion A2...
start http://localhost:5173
node -e "const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';let f=path.join(process.cwd(),p);if(fs.existsSync(f)&&fs.statSync(f).isFile()){let e=path.extname(f);res.writeHead(200,{'Content-Type':e==='.js'?'application/javascript':e==='.css'?'text/css':e==='.html'?'text/html':e==='.json'?'application/json':e==='.svg'?'image/svg+xml':'application/octet-stream'});fs.createReadStream(f).pipe(res);}else{res.writeHead(200,{'Content-Type':'text/html'});fs.createReadStream(path.join(process.cwd(),'index.html')).pipe(res);}}).listen(5173,()=>console.log('App en http://localhost:5173'));"
