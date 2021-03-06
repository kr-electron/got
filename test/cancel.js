import stream from 'stream';
import test from 'ava';
import getStream from 'get-stream';
import PCancelable from 'p-cancelable';
import got from '..';
import {createServer} from './helpers/server';

const Readable = stream.Readable;

async function createAbortServer() {
	const s = await createServer();
	const aborted = new Promise((resolve, reject) => {
		s.on('/abort', (req, res) => {
			req.on('aborted', resolve);
			res.on('finish', reject.bind(null, new Error('Request finished instead of aborting.')));

			getStream(req).then(() => {
				res.end();
			});
		});
	});

	await s.listen(s.port);

	return {
		aborted,
		url: `${s.url}/abort`
	};
}

test('cancel in-progress request', async t => {
	const helper = await createAbortServer();
	const body = new Readable({
		read() {}
	});
	body.push('1');

	const p = got(helper.url, {body});

	// Wait for the stream to be established before canceling
	setTimeout(() => {
		p.cancel();
		body.push(null);
	}, 100);

	await t.throws(p, PCancelable.CancelError);
	await t.notThrows(helper.aborted, 'Request finished instead of aborting.');
});

test('cancel immediately', async t => {
	const s = await createServer();
	const aborted = new Promise((resolve, reject) => {
		// We won't get an abort or even a connection
		// We assume no request within 1000ms equals a (client side) aborted request
		s.on('/abort', (req, res) => {
			res.on('finish', reject.bind(this, new Error('Request finished instead of aborting.')));
			res.end();
		});
		setTimeout(resolve, 1000);
	});

	await s.listen(s.port);

	const p = got(`${s.url}/abort`);
	p.cancel();
	await t.throws(p);
	await t.notThrows(aborted, 'Request finished instead of aborting.');
});
