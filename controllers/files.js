var tres = require('../helpers/tres');
var error = require('../helpers/error');
var note_model = require('../models/note');

exports.route = function(app) {
	app.get('/notes/:note_id/attachment', get_note_file);
	app.put('/notes/:note_id/attachment', attach_file);
};

var get_note_file = function(req, res) {
	var user_id = req.user.id;
	var note_id = req.params.note_id;

	return note_model.get_file_url(user_id, note_id)
		.then(function(file_url) {
			tres.redirect(res, file_url, {redirect: true});
		})
		.catch(tres.err.bind(tres, res));
};

/**
 * attach a file to a note using streaming.
 *
 * just want to say one thing about this function: sorry. sorry to anyone who
 * has to try and follow it. i made it as simple as i could, but there are so
 * many weird little edge cases when dealing with streaming that it's bound to
 * be complicated. but hey, at least i commented it, right?!
 */
var attach_file = function(req, res) {
	var user_id = req.user.id;
	var note_id = req.params.note_id;
	var client = req.header('X-Turtl-Client');

	// the stream passed back from our file writer plugin
	var stream = null;
	// true when our incoming stream (req) has finished sending
	var done = false;
	// true when we've sent a response, any response, to the client
	var sent = false;
	// the function passed back by our file handler that we call after a
	// successful upload occurs (ie, no errors during upload)
	var finishfn = false;
	// handles errors for us
	var errfn = function(err) {
		sent = true;
		return tres.err(res, err);
	};
	// tracks how many active writes we have. this is important because we don't
	// want to mark things as finished when we are actively writing to our
	// stream. using (active_writes == 0 && done) we can know for certain that
	// we are finished and can run our finishfn()
	var active_writes = 0;
	// track the total size of the file
	var total_size = 0;
	// handed to our streamer() function as the error-handling callback
	var streamcb = function(err, _) {
		active_writes--;
		if(err) return errfn(err);
		// if no error and client is not done sending, do nothing
		if(!done) return;
		// we're writing to the stream, don't finish or end
		if(active_writes > 0) return;
		// we're done! call our finishfn
		stream.end();
		return finishfn(total_size)
			.then(function(notedata) {
				sent = true;
				analytics.track(user_id, 'file.upload', client, {size: file_size});
				return tres.send(res, notedata);
			})
			.catch(errfn);
	};
	// writes to the stream, and increments our active_writes count, calling the
	// streamcb once complete (which in turn decrements active_writes and checks
	// if we're done).
	var write = function(chunk) {
		active_writes++;
		stream.write(chunk, streamcb);
	};

	var buffer = [];
	var start_upload = function() {
		if(sent) return;
		// send our buffer into the stream and then clear the buffer
		write(Buffer.concat(buffer));
		buffer = [];
	};
	req.on('data', function(chunk) {
		total_size += chunk.length;
		if(sent) return;
		// if we don't have a stream (waiting on note model), buffer our writes
		if(!stream) return buffer.push(chunk);
		write(chunk);
	});
	req.on('end', function() {
		if(sent) return;
		// mark the client upload as done. careful, just becaues this is true
		// doesn't mean we're done streaming. we may still have active writers
		// on the stream (active_writes > 0) so we need to check both before
		// stampeding towards a success response.
		done = true;
		// in the case the entire upload finished before we even have a stream
		// ready, just return. we'll finalize everything once the stream is
		// created.
		if(!stream) return;
		// do an empty write. this gives our streamcb a little nudge in case we
		// finish here AFTER the last write finishes (it's possible)
		write(Buffer.concat([]));
	});
	// ok, here's where we drive things forward. grab the stream/finishfn from
	// the note model and start the upload to our destination
	return note_model.attach_file(user_id, note_id)
		.spread(function(_stream, _finishfn) {
			stream = _stream;
			finishfn = _finishfn;
			stream.on('error', errfn);
			// kewll we got a stream, start the upload
			return start_upload();
		})
		.catch(errfn);
};

