let ffmetadata = require("ffmetadata");
let Client = require('node-rest-client').Client;
let client = new Client();
let request = require('request');
let fs = require('fs');
let cmdArgs = require('minimist')(process.argv.slice(2));

function setMetadata(songName, imageName, musicMeta, callback) {
    let options = {
        attachments: [imageName]
    }
    ffmetadata.write(songName, musicMeta, options, (err) => {
        if (err)
            callback(new Error('Error writing song metadata'));
        else 
            callback(undefined);
    });
};

function downloadCoverArt(releaseId, callback) {
    const coverUrl = 'http://coverartarchive.org/release/';
    let coverArgs = {
        headers: { 'user-agent': 'songfixer' },
        path: { releaseId: releaseId },
        requestConfig: {
            followRedirects: true,
            maxRedirects: 5
        }
    }

    let reqCoverArt = client.get(coverUrl + '${releaseId}', coverArgs, (data, response) => {
        if (response.statusCode == 200) {
            let download = (uri, filename, callback) => {
                console.log('Downloading cover art...');
                request.head(uri, (err, res, body) => {
                    request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
                });
            };
            let imageName = 'tempca-' + releaseId + '.jpg';
            download(data.images[0].image, imageName, () => {
                callback(undefined, imageName);
            });
        } else {
            console.log('Cover art not found for this release');
            callback(new Error('Cover art not found for this release'), undefined);
        }
    }).on('error', (err) => {
        console.log('Request error - ', err.message);
    }).on('requestTimeout', (req) => {
        console.log('Request has expired.');
        req.abort();
    }).on('responseTimeout', function (res) {
        console.log("Response has expired");
    });
};

function fetchMusicMeta(title, artist, callback) {

    const musicUrl = `http://musicbrainz.org/ws/2/`;
    let musicArgs = {
        headers: { 'user-agent': 'songfixer' },
        parameters: {
            query: title + ' AND ' + 'artist:' + artist,
            limit: 3,
            fmt: 'json'
        },
        path: { type: 'recording' }
    };

    let musicMeta = [];
    let req = client.get(musicUrl + "${type}", musicArgs, (data, response) => {
        if (response.statusCode == 200) {
            let index = 0;
            for (let recording of data.recordings) {
                musicMeta.push({
                    title: recording.title,
                    artist: recording['artist-credit'][0].artist.name,
                    releaseId: recording.releases[0].id,
                    releaseTitle: recording.releases[0].title
                });
                index++;
            }
            callback(undefined, musicMeta);
        }
        else 
            callback(new Error('Request song not found'), musicMeta);

    }).on('error', (err) => {
        console.log('Request error - ', err.message);
    }).on('requestTimeout', (req) => {
        console.log('Request has expired.');
        req.abort();
    }).on('responseTimeout', function (res) {
        console.log("Response has expired");
    });

};

if (cmdArgs.s) {
    ffmetadata.read(cmdArgs.s, function (err, data) {
        if (err)
            console.error("Error reading metadata", err.message);
        else
            fetchMusicMeta(data.title.replace(/^\d+./g, '').trim(), data.artist, (err, musicMeta) => {
                if ( err ) 
                    console.error(err.message);
                else {
                    console.log('Song metadata fetched');
                    downloadCoverArt(musicMeta[0].releaseId, (err, imageName) => {
                        if ( err ) 
                            console.error(err.message);
                        else {
                            console.log('Cover art downloaded');
                            setMetadata(cmdArgs.s, imageName, musicMeta[0], (err) => {
                                if ( err )
                                    console.error(err.message);
                                else {
                                        console.log('Song metadata set');
                                        fs.unlink(imageName, (err) => {
                                            console.log('All done');
                                        });
                                    }
                            })
                        }
                    })
                }
            });
    });

} else {
    console.log('Usage : node songfixer.js -s <song_name_here>');
}

