import test from 'ava';
import pem from 'pem';
import pify from 'pify';
import got from '..';
import {createServer, createSSLServer} from './helpers/server';

let http;
let https;

const pemP = pify(pem, Promise);

test.before('setup', async () => {
	const caKeys = await pemP.createCertificate({
		days: 1,
		selfSigned: true
	});

	const caRootKey = caKeys.serviceKey;
	const caRootCert = caKeys.certificate;

	const keys = await pemP.createCertificate({
		serviceCertificate: caRootCert,
		serviceKey: caRootKey,
		serial: Date.now(),
		days: 500,
		country: '',
		state: '',
		locality: '',
		organization: '',
		organizationUnit: '',
		commonName: 'sindresorhus.com'
	});

	const key = keys.clientKey;
	const cert = keys.certificate;

	https = await createSSLServer({key, cert}); // eslint-disable-line object-property-newline

	https.on('/', (req, res) => {
		res.end('https');
	});

	http = await createServer();

	http.on('/', (req, res) => {
		res.end('reached');
	});

	http.on('/finite', (req, res) => {
		res.writeHead(302, {
			location: `${http.url}/`
		});
		res.end();
	});

	http.on('/utf8-url-áé', (req, res) => {
		res.end('reached');
	});

	http.on('/redirect-with-utf8-binary', (req, res) => {
		res.writeHead(302, {
			location: Buffer.from(`${http.url}/utf8-url-áé`, 'utf8').toString('binary')
		});
		res.end();
	});

	http.on('/endless', (req, res) => {
		res.writeHead(302, {
			location: `${http.url}/endless`
		});
		res.end();
	});

	http.on('/relative', (req, res) => {
		res.writeHead(302, {
			location: '/'
		});
		res.end();
	});

	http.on('/seeOther', (req, res) => {
		res.writeHead(303, {
			location: '/'
		});
		res.end();
	});

	http.on('/temporary', (req, res) => {
		res.writeHead(307, {
			location: '/'
		});
		res.end();
	});

	http.on('/permanent', (req, res) => {
		res.writeHead(308, {
			location: '/'
		});
		res.end();
	});

	http.on('/relativeQuery?bang', (req, res) => {
		res.writeHead(302, {
			location: '/'
		});
		res.end();
	});

	http.on('/httpToHttps', (req, res) => {
		res.writeHead(302, {
			location: https.url
		});
		res.end();
	});

	await http.listen(http.port);
	await https.listen(https.port);
});

test('follows redirect', async t => {
	const {body, redirectUrls} = await got(`${http.url}/finite`);
	t.is(body, 'reached');
	t.deepEqual(redirectUrls, [`${http.url}/`]);
});

test('follows 307, 308 redirect', async t => {
	const tempBody = (await got(`${http.url}/temporary`)).body;
	t.is(tempBody, 'reached');

	const permBody = (await got(`${http.url}/permanent`)).body;
	t.is(permBody, 'reached');
});

test('does not follow redirect when disabled', async t => {
	t.is((await got(`${http.url}/finite`, {followRedirect: false})).statusCode, 302);
});

test('relative redirect works', async t => {
	t.is((await got(`${http.url}/relative`)).body, 'reached');
});

test('throws on endless redirect', async t => {
	const err = await t.throws(got(`${http.url}/endless`));
	t.is(err.message, 'Redirected 10 times. Aborting.');
	t.deepEqual(err.redirectUrls, Array(10).fill(`${http.url}/endless`));
});

test('query in options are not breaking redirects', async t => {
	t.is((await got(`${http.url}/relativeQuery`, {query: 'bang'})).body, 'reached');
});

test('hostname+path in options are not breaking redirects', async t => {
	t.is((await got(`${http.url}/relative`, {
		hostname: http.host,
		path: '/relative'
	})).body, 'reached');
});

test('redirect only GET and HEAD requests', async t => {
	const err = await t.throws(got(`${http.url}/relative`, {body: 'wow'}));
	t.is(err.message, 'Response code 302 (Found)');
	t.is(err.path, '/relative');
	t.is(err.statusCode, 302);
});

test('redirect on 303 response even with post, put, delete', async t => {
	const {url, body} = await got(`${http.url}/seeOther`, {body: 'wow'});
	t.is(url, `${http.url}/`);
	t.is(body, 'reached');
});

test('redirects from http to https works', async t => {
	t.truthy((await got(`${http.url}/httpToHttps`, {rejectUnauthorized: false})).body);
});

test('redirects works with lowercase method', async t => {
	const body = (await got(`${http.url}/relative`, {method: 'head'})).body;
	t.is(body, '');
});

test('redirect response contains new url', async t => {
	const url = (await got(`${http.url}/finite`)).url;
	t.is(url, `${http.url}/`);
});

test('redirect response contains old url', async t => {
	const requestUrl = (await got(`${http.url}/finite`)).requestUrl;
	t.is(requestUrl, `${http.url}/finite`);
});

test('redirect response contains utf8 with binary encoding', async t => {
	t.is((await got(`${http.url}/redirect-with-utf8-binary`)).body, 'reached');
});

test.after('cleanup', async () => {
	await http.close();
	await https.close();
});
