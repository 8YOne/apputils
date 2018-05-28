"use strict";

//let logger = require('../../src/utils/Logger')
import * as fs from 'fs';
import * as path from 'path';
import * as utils from './utils.js';
import {logger} from "./utils";

export function fileExists(location: string, orDirectory = true) {
    try {
        let file = fs.statSync(location)
        if (file.isFile())
            return true
        else if (orDirectory && file.isDirectory())
            return true
    } catch (error) {}
    return false
}

export function getFolderSize(folderPath: string, callback) {
    fs.lstat(folderPath, (err, stat) => {
        if (err)
            return callback(err)
        let totalSize = stat.size // 0 for folders
        if (stat.isDirectory() === true) {
            fs.readdir(folderPath, (err, files) => {
                if (err)
                    return callback(err)
                Promise.all(files.map((file) => {
                    return new Promise((resolve, reject) => {
                        this.getFolderSize(path.join(folderPath, file), (err, size) => {
                            totalSize += size
                            resolve(totalSize)
                        })
                    })
                })).then((size) => {
                    callback(err, totalSize) // if we traveresd only down 1 folder [size] == totalSize
                })
            })
        }
        else
            callback(err, totalSize)
    })
}

export function removeFolder(folderPath: string, callback) {
    fs.lstat(folderPath, (err, stat) => {
        if (err) {
            if (err.code === 'ENOENT') // swallow "no such file or directory"
                return callback()
            return callback(err)
        }
        if (stat.isDirectory() === true) {
            fs.readdir(folderPath, (err, files) => {
                if (err)
                    return callback(err)
                Promise.all(files.map((file) => {
                    return new Promise((resolve, reject) => {
                        this.removeFolder(path.join(folderPath, file), (err) => {
                            resolve(err)
                        })
                    })
                })).then((err) => { // Promise.all() will immediately resolve if files is empty
                    fs.rmdir(folderPath, callback)
                })
            })
        }
        else {
            fs.unlink(folderPath, (err) => {
                callback(err)
            })
        }
    })
}

/**
 * Recursively lists all files in a folder. Only files are returned. Folders do not get a separate entry.
 * Instead they are part of the relative path of the listed files.
 * The returned paths will be relative to folderPath
 * @param folderPath
 * @param callback
 * @param replacePath
 */
export function listDir(folderPath: string, callback: (err: any, dirFiles?: string[]) => void, replacePath?: RegExp) {
    if (typeof replacePath === 'undefined') // only set this on root level. used to generate relative paths
        replacePath = new RegExp('^' + utils.escapeRegex(folderPath)) // set replacePath to empty string or custom regex to disable/change replacement
    fs.readdir(folderPath, (err, files) => {
        if (err)
            return callback(err)
        let dirFiles = []
        let pending = files.length
        if (pending === 0)
            return callback(err, dirFiles)
        files.forEach((file) => {
            let fullpath = path.join(folderPath, file)
            fs.stat(fullpath, (err, stat) => {
                if (err) {
                    if (--pending === 0)
                        return callback(err)
                    return
                }
                if (stat.isDirectory() === true) {
                    this.listDir(fullpath, (err, files) => {
                        if (err) {
                            if (--pending === 0)
                                return callback(err)
                            return
                        }
                        dirFiles = dirFiles.concat(files) // recursively add the files we found in the sub directories to the list
                        if (--pending === 0)
                            callback(err, dirFiles)
                    }, replacePath)
                }
                else {
                    dirFiles.push(fullpath.replace(replacePath, '')) // add a single new file
                    if (--pending === 0)
                        callback(err, dirFiles)
                }
            })
        })
    })
}

export function getExistingFiles(filesArr: string[], callback) {
    Promise.all(filesArr.map((file) => {
        return new Promise((resolve, reject) => {
            fs.stat(file, (err, stat) => {
                if (err)
                    return resolve(null) // don't reject because the purpose of this function is to check wheter files exist
                resolve(file) // file or dir
            })
        })
    })).then((existingFilesArr) => {
        callback(existingFilesArr.filter((file) => {
            return file !== null
        }))
    })
}

export function getFileExtension(name: string, withDot = true, defaultExt = '') {
    let pos = name.lastIndexOf('.')
    if (pos === -1)
        return defaultExt
    if (withDot === false)
        pos++
    let extension = name.substr(pos)
    if (extension.length > 5)
        return defaultExt
    return extension.toLowerCase()
}

/**
 * Used to get names from URL paths (and UNIX style paths)
 * @param path
 * @returns {*}
 */
export function getNameFromPath(path: string) {
    let pos = path.lastIndexOf('/')
    if (pos === -1)
        return path
    return path.substr(pos+1)
}

export function getDirFromPath(path: string) {
    let pos = path.lastIndexOf('/')
    if (pos === -1)
        return path
    return path.substr(0, pos)
}

export function copy(source: string, target: string) {
    return new Promise<void>((resolve, reject) => {
        let rd = fs.createReadStream(source);
        rd.on("error", (err) => {
            reject(err); // promise can only resolve once if both streams have errors
        });
        let wr = fs.createWriteStream(target);
        wr.on("error", (err) => {
            reject(err);
        });
        wr.on("close", (ex) => {
            resolve();
        });
        rd.pipe(wr);
    })
}

/**
 * Delete an array of files.
 * @param filesArr {Array} the strings of files. Use an inner array to concatenate paths platform specific [['path/to', 'my', 'file']]
 * @returns {Promise}
 */
export function deleteFiles(filesArr: string[]) {
    return new Promise<void>((resolve, reject) => {
        let deleteOps = []
        filesArr.forEach((file: string | string[]) => {
            deleteOps.push(new Promise((resolve, reject) => {
                if (typeof file !== "string") // type: string[] == object
                    file = path.join(...file)
                fs.unlink(file, (err) => {
                    if (err) {
                        if (err.code === "ENOENT") // file doesn't exist anymore, continue
                            return resolve()
                        return reject(err)
                    }
                    resolve()
                })
            }))
        })
        Promise.all(deleteOps).then(() => {
            resolve()
        }).catch((err) => {
            reject(err)
        })
    })
}

export function removeUnallowedChars(filename: string) {
    // http://stackoverflow.com/questions/1976007/what-characters-are-forbidden-in-windows-and-linux-directory-names
    // missing: All control codes (<= 31)
    return filename.replace(/[\/\0<>:"\\|\?\*]/g, "")
}

/**
 * Creates a file if it doesn't already exist
 * @param filename
 * @param contents (optional) the contents to write into the file
 * @returns {Promise<boolean>} true if the file has been created, false if it already existed. Promise rejection in case of an error.
 */
export function touch(filename: string, contents = "") {
    return new Promise<boolean>((resolve, reject) => {
        fs.stat(filename, (err, stats) => {
            if (err) {
                if (err.code === "ENOENT") {
                    fs.writeFile(filename, contents, {encoding: "utf8"}, (err) => {
                        if (err)
                            return reject({txt: "Error creating file", err: err})
                        resolve(true)
                    })
                    return;
                }
                return reject({txt: "Error checking file existence", err: err})
            }
            if (!stats.isFile())
                return reject({txt: "File to write is not a regular file", stats: stats})
            resolve(false)
        })
    })
}

export function isSafePath(pathStr: string, appDir = "") {
    if (!appDir)
        appDir = utils.appDir;
    pathStr = path.resolve(pathStr);
    if (pathStr.substr(0, appDir.length) !== appDir)
        return false;
    return true;
}

export function cleanupDir(dirPath, maxAgeMin, create = true) {
    return new Promise<void>((resolve, reject) => {
        fs.readdir(dirPath, (err, files) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    if (!create)
                        return resolve();
                    return fs.mkdir(dirPath, (err) => {
                        if (err)
                            logger.error('Error creating temp dir', err)
                    })
                }
                return logger.error('Error cleaning temp dir', err)
            }
            let cleanups = []
            let maxAge = new Date().getTime() - maxAgeMin * 60 * 1000
            files.forEach((file) => {
                cleanups.push(new Promise((resolve, reject) => {
                    let filePath = path.join(dirPath, file)
                    fs.lstat(filePath, (err, stats) => {
                        if (err) {
                            logger.error(JSON.stringify(err))
                            return resolve() // continue
                        }
                        let created = new Date(stats.ctime)
                        // only delete root files. other parts of this app might write different things in here
                        if (stats.isFile() && created.getTime() < maxAge) {
                            fs.unlink(filePath, (err) => {
                                if (err)
                                    logger.error(JSON.stringify(err))
                            })
                        }
                        resolve()
                    })
                }))
            })
            Promise.all(cleanups).then(() => {
                resolve()
            }).catch((err) => {
                logger.error('Error cleaning up temp dir', err)
                resolve() // continue cleaning
            })
        })
    })
}

export function getInstallDate() {
    return new Promise<Date>((resolve, reject) => {
        let checkFiles = ["updater.json", "package.json"] // package.json is not always modified on update, check it last
        let checkNextFile = (filename) => {
            const packageFile = path.join(utils.appDir, filename)
            fs.lstat(packageFile, (err, stat) => {
                if (err) {
                    if (err.code === 'ENOENT') {
                        if (checkFiles.length === 0)
                            return reject({txt: "package.json file in appDir doesn't exist", location: packageFile, err: err})
                        checkNextFile(checkFiles.shift());
                        return
                    }
                    return reject({txt: "Unknown error", location: packageFile, err: err})
                }
                resolve(stat.mtime)
            })
        }
        checkNextFile(checkFiles.shift());
    })
}

export function readFile(file: string, options?: { encoding?: "utf8"; flag?: string; }) {
    return new Promise<string>((resolve, reject) => {
        if (!options)
            options = {};
        if (!options.encoding)
            options.encoding = "utf8";
        fs.readFile(file, options, (err, data) => {
            if (err)
                return reject(err);
            resolve(data as string); // already a string
        })
    })
}