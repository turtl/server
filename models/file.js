"use strict";

var Promise = require('bluebird');
var config = require('../helpers/config');
var fs = require('fs');
var AWS = require('aws-sdk');
AWS.config.update({accessKeyId: config.s3.token, secretAccessKey: config.s3.secret});
var s3_stream = require('s3-upload-stream')(new AWS.S3());

/**
 * returns the uploading interface for a local file
 */
var upload_local = function(file_id) {
	return fs.createWriteStream(config.uploads.local+'/'+file_id);
};

/**
 * returns the uploading interface for storing on S3
 */
var upload_s3 = function(file_id) {
	return s3_stream.upload({
		Bucket: config.s3.bucket,
		ACL: 'private',
		ContentType: 'application/octet-stream',
		Key: 'files/'+file_id,
	});
};

/**
 * returns the url for a local upload
 */
var geturl_local = function(file_id) {
	return Promise.resolve(config.uploads.url+'/'+file_id);
};

/**
 * returns the url for an s3 upload
 */
var geturl_s3 = function(file_id) {
	var params = {
		Bucket: config.s3.bucket,
		Key: 'files/'+file_id,
		Expires: 900
	};
	var s3 = new AWS.S3();
	return Promise.resolve(s3.getSignedUrl('getObject', params));
};

/**
 * deletes a file locally, returns a Promise resolving when finished
 */
var delete_local = function(file_id) {
	return new Promise(function(resolve, reject) {
		fs.unlink(config.uploads.local+'/'+file_id, function(err, _) {
			if(err) return reject(err);
			resolve(true);
		});
	});
};

/**
 * deletes a file on s3, returns a Promise resolving when finished
 */
var delete_s3 = function(file_id) {
	return new Promise(function(resolve, reject) {
		var params = {
			Bucket: config.s3.bucket,
			Key: 'files/'+file_id,
		};
		var s3 = new AWS.S3();
		s3.deleteObject(params, function(err, _) {
			if(err) return reject(err);
			resolve(true);
		});
	});
};

/**
 * attach a file to a note. assumes all permissions checks are completed.
 * returns a streaming function that will save the data to the proper location.
 */
exports.attach = function(note_id) {
	if(config.uploads.local) {
		return upload_local(note_id);
	} else {
		return upload_s3(note_id);
	}
};

exports.file_url = function(note_id) {
	if(config.uploads.local) {
		return geturl_local(note_id);
	} else {
		return geturl_s3(note_id);
	}
};

/**
 * remove an attachment from a note. this assumes all permissions checks are
 * complete, and is really just responsible for the dirty work.
 */
exports.delete_attachment = function(note_id) {
	if(config.uploads.local) {
		return delete_local(note_id);
	} else {
		return delete_s3(note_id);
	}
};

