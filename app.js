'use strict';

var Kraken = require('kraken');
var kraken = new Kraken({
    'api_key': 'ENTER YOURS HERE',
    'api_secret': 'ENTER YOURS HERE'
});

var fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
var multer = require('multer');
var archiver = require('archiver'); // for saving images into a zip
var request = require('request'); // for downloading from urls

const PORT = 8080;
const HOST = 'localhost';

const app = express();

const UNPROCESSED_FOLDER_NAME = "unprocessed";
const PROCESSED_FOLDER_NAME = "processed";

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS');
    next();
});

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());


// using functional inheritance
function KrakenClass(browserIdentity) {
    console.log("Kraken Construction: √ create stack object to be returned");
    var obj = {}; // the object itself

    console.log(`√ Creating private vars...`);
    var browserId = browserIdentity;

    console.log("√ Creating private functions...");

    function readFileNamesFromDirectory(fileSystem, directoryName) {
        let directoryContentNames = [];
        const folder = `./${directoryName}/`;
        fileSystem.readdirSync(folder).forEach(file => {
            directoryContentNames.push(file);
        })
        return directoryContentNames;
    }

    function createParamArrayForKrakenService(unprocessedArr, unprocessedDirectory) {
      let paramArray = [];
      for (let i = 0; i < unprocessedArr.length; i++) {
          paramArray.push({
              file: `${unprocessedDirectory}/${unprocessedArr[i]}`,
              wait: true,
              lossy: true
          });
      }
      return paramArray;
    }

    function assembleKrakenServicesIntoPromises(paramArray, browserId) {
      const krakenPromises = [];
      for (let i = 0; i < paramArray.length; i++) {
          krakenPromises.push(uploadToKrakenAndDownloadResult(paramArray[i], browserId));
      }
      return krakenPromises;
    }

    function uploadToKrakenAndDownloadResult(urlString, browserId) {
      return new Promise((resolve, reject) => {
        kraken.upload(urlString, function (status) {
            if (status.success) {
                let fullURL = status.kraked_url
                let indexOfSlash = fullURL.lastIndexOf("/")
                let fileName = fullURL.substring(indexOfSlash+1, fullURL.length);
                downloadProcessedImages(status.kraked_url,
                  `${obj.processedFolderName}/${fileName}`, function(){
                  console.log(`√ done downloading:  ${fileName} into ${obj.processedFolderName}/`);
                  resolve(status.kraked_url);
                });
            } else {
                console.log('ø Failed! Error message: %s', status.message);
                reject(status.message);
            }
        }); // kraken upload
      }); // Promise
    }

    function createFolderForBrowser(folderAlphaString) {
        let folderWithBrowserIDName = `${folderAlphaString}-${browserId}`;
        if (!fs.existsSync(folderWithBrowserIDName)){
            fs.mkdirSync(folderWithBrowserIDName);
        }
        return folderWithBrowserIDName;
    }

    var downloadProcessedImages = function(uri, filename, callback){
      request.head(uri, function(err, res, body){
        console.log('content-type:', res.headers['content-type']);
        console.log('content-length:', res.headers['content-length']);
        request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
      });
    };


    console.log("√ Creating public functions...")

    function saveAsZip(fileName, fromDirectoryName, response) {
          console.log("-- saveAsZip --");
          let p = new Promise((resolve, reject) => {
            let fullFileName = `/${fileName}.zip`
            var output = fs.createWriteStream(__dirname + fullFileName);
            var archive = archiver('zip');
            output.on('close', function() {
                var file = __dirname + `${fullFileName}`;
                resolve(`file to download from: ${file}`);
            });
            archive.on('error', function(err) {
                throw err;
            });
            archive.pipe(output);
            archive.directory(`${fromDirectoryName}/`, false);
            archive.finalize();
          });
          return p;
    }


    function runAllKrakenPromises(promises, req, res) {
      let p = new Promise((resolve, reject)=> {
        Promise.all(promises).then(function(output) {
          console.log(output);
          console.log("runAllKrakenPromises: resolving all kraken promises...");
          console.log(obj.processedFolderName);
          resolve(obj.processedFolderName);
        });
      });
      return p;
    }

    function processImagesFromClientPromise(req, res) {

      let p = new Promise((resolve, reject) => {
          var Storage = multer.diskStorage({
                 destination: function(req, file, callback) {
                     console.log("multer.diskStorage - Your browser id is: "+req.query.browserIdentity);
                     // we create a folder like so
                     callback(null, `./${obj.unprocessedFolderName}`);
                 },
                 filename: function(req, file, callback) {
                    console.log(`---The original name is - ${file.originalname}`);
                    callback(null, file.originalname);
                 }
             });

            var upload = multer({ storage: Storage }).array("file", 86);
            if (upload) {
               upload(req, res, function(err) {
                   console.log("√ Finished receiving image(s) from client");
                   if (err) {
                      console.log("----error uploading file----");
                      console.log(err);
                      return res.end("Something went wrong!");
                   }
                   console.log("processImagesFromClientPromise: resolving saving images using Multer...");
                   resolve(obj.unprocessedFolderName);
               });
            }
      });
      return p;
    }

    function readyKrakenPromises(unprocessedDirectory, req, res) {
        let p = new Promise(function(resolve, reject) {
            let unprocessedImagesArr = readFileNamesFromDirectory(fs, unprocessedDirectory);
            let paramArray = createParamArrayForKrakenService(unprocessedImagesArr, unprocessedDirectory);
            let allKrakenPromises = assembleKrakenServicesIntoPromises(paramArray, browserId);
            resolve(allKrakenPromises);
        })
      return p;
    }

    obj.krakenTheImages = function(req, res, callback) {
        processImagesFromClientPromise(req, res)
        .then(unprocessedFolderName => readyKrakenPromises(unprocessedFolderName, req, res))
        .then(krakenPromises => runAllKrakenPromises(krakenPromises, req, res))
        .then(processedFolderName => saveAsZip(`${req.query.browserIdentity}-download`, processedFolderName, res))
        .then(function(result) {
            callback(result);
        });
    }
    console.log("√ Creating public vars")
    obj.unprocessedFolderName = createFolderForBrowser(UNPROCESSED_FOLDER_NAME);
    obj.processedFolderName = createFolderForBrowser(PROCESSED_FOLDER_NAME);

    console.log(`constructed folders: ${obj.unprocessedFolderName}, ${obj.processedFolderName}`)
    return obj; // return it
}

app.post("/upload", function(req, res) {
  console.log("reached /upload...");

  console.log("browserIdentity: " + req.query.browserIdentity);
  res.end("We will send you a zip with your Krakened images soon...");

  var krakenInstance = KrakenClass(req.query.browserIdentity);
  krakenInstance.krakenTheImages(req, res, function(result){
    console.log(result);
  });

});

app.listen(PORT, HOST);
console.log(' ∏ØˇˇØ∏ Feed. The. Kraken! Listening on %s:%d...', HOST || '*', PORT);
module.exports = app;
