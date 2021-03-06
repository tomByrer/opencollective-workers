const apiKeys = {
  production: '_PRODUCTION_API_KEY_',
  staging: '09u624Pc9F47zoGLlkg1TBSbOl2ydSAq',
};

const domains = {
  production: {
    frontend: 'frontend.opencollective.com',
    api: 'api.opencollective.com',
    images: 'images.opencollective.com',
    invoices: 'invoices.opencollective.com',
    rest: 'rest.opencollective.com',
  },
  staging: {
    frontend: 'frontend-staging.opencollective.com',
    api: 'api-staging.opencollective.com',
    images: 'images-staging.opencollective.com',
    invoices: 'invoices-staging.opencollective.com',
    rest: 'rest-staging.opencollective.com',
  },
};

const availableLanguages = ['en', 'fr', 'ja', 'es'];

addEventListener('fetch', event => {
  event.passThroughOnException();

  event.respondWith(handleOpenCollective(event));
});

function getEnvironment(url) {
  if (url.hostname === 'staging.opencollective.com') {
    return 'staging';
  }
  if (url.hostname === 'opencollective.com') {
    return 'production';
  }
}

function getBackend(url) {
  // api
  if (url.pathname.indexOf('/api/') === 0) {
    return 'api';
  }
  // Invoices
  if (url.pathname.match(/(invoice\.pdf|invoice\.html)$/)) {
    return 'invoices';
  }
  // REST API (json, csv)
  if (url.pathname.match(/(\.json|\.csv)$/)) {
    return 'rest';
  }
  // public
  if (url.pathname.match(/^\/public\//)) {
    return 'frontend';
  }
  // static-images
  if (url.pathname.match(/^\/static\/images\/.*/)) {
    return 'frontend';
  }
  // logo
  // e.g. /react-native-elements/logo.txt
  if (url.pathname.match(/^\/([^/]*)\/logo\.(jpg|png|svg|txt)/)) {
    return 'images';
  }
  // badge
  // e.g. /webpack/backers/badge.svg
  if (url.pathname.match(/\/badge.(png|svg)$/)) {
    return 'images';
  }
  // avatar
  // e.g. /mochajs/sponsor/0/avatar.svg
  if (url.pathname.match(/\/avatar(\.(png|svg|jpg))?$/)) {
    return 'images';
  }
  // website
  // e.g. /mochajs/sponsor/0/website
  if (url.pathname.match(/\/website$/)) {
    return 'images';
  }
  // backers/sponsors and tiers (svg and png)
  // e.g. /mochajs/backers.svg or /gulpjs/tiers/individual.svg
  if (
    url.pathname.match(
      /^\/([^/]*)\/(backers?|sponsors?|tiers\/([^/]*)).(png|svg)$/,
    )
  ) {
    return 'images';
  }
  // contributors
  // mosaic of github contributors
  if (url.pathname.match(/\/contributors\.svg$/)) {
    return 'images';
  }
  // default
  return 'frontend';
}

function addResponseHeaders(response, responseHeaders) {
  const headers = {};
  for (const pair of response.headers) {
    headers[pair[0]] = pair[1];
  }
  Object.keys(responseHeaders).forEach(key => {
    headers[key] = responseHeaders[key];
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers,
  });
}

async function handleOpenCollective(event) {
  const request = event.request;
  const url = new URL(request.url);
  const environment = getEnvironment(url);
  const backend = getBackend(url);
  const responseHeaders = {};
  if (backend) {
    responseHeaders['oc-backend'] = backend;
  }
  if (environment) {
    responseHeaders['oc-environment'] = environment;
  }
  let response;
  if (domains[environment] && domains[environment][backend]) {
    url.hostname = domains[environment][backend];
  }
  if (backend === 'api' && url.pathname.indexOf('/api/') === 0) {
    url.pathname = url.pathname.replace('/api/', '');
    url.searchParams.set('api_key', apiKeys[environment]);
  }
  // Redirects
  if (backend === 'frontend' && url.pathname === '/about') {
    return Response.redirect('https://docs.opencollective.com/help/about', 301);
  }
  // Localization
  if (backend === 'frontend') {
    const acceptLanguage = request.headers.get('Accept-Language');
    if (acceptLanguage) {
      const detectedLanguage = pickLanguage(availableLanguages, acceptLanguage);
      if (detectedLanguage) {
        responseHeaders['oc-language'] = detectedLanguage;
        if (detectedLanguage !== 'en' && !url.searchParams.get('language')) {
          url.searchParams.set('language', detectedLanguage);
        }
      }
    }
  }
  response = await fetch(url, request);
  if (Object.keys(responseHeaders).length) {
    response = addResponseHeaders(response, responseHeaders);
  }
  return response;
}

function parseLanguage(al) {
  const strings = (al || '').match(
    /((([a-zA-Z]+(-[a-zA-Z0-9]+){0,2})|\*)(;q=[0-1](\.[0-9]+)?)?)*/g,
  );
  return strings
    .map(m => {
      if (!m) {
        return;
      }

      const bits = m.split(';');
      const ietf = bits[0].split('-');
      const hasScript = ietf.length === 3;

      return {
        code: ietf[0],
        script: hasScript ? ietf[1] : null,
        region: hasScript ? ietf[2] : ietf[1],
        quality: bits[1] ? parseFloat(bits[1].split('=')[1]) : 1.0,
      };
    })
    .filter(r => {
      return r;
    })
    .sort((a, b) => {
      return b.quality - a.quality;
    });
}

function pickLanguage(supportedLanguages, acceptLanguage, options) {
  options = options || {};

  if (!supportedLanguages || !supportedLanguages.length || !acceptLanguage) {
    return null;
  }

  acceptLanguage = parseLanguage(acceptLanguage);

  const supported = supportedLanguages.map(support => {
    const bits = support.split('-');
    const hasScript = bits.length === 3;

    return {
      code: bits[0],
      script: hasScript ? bits[1] : null,
      region: hasScript ? bits[2] : bits[1],
    };
  });

  for (let i = 0; i < acceptLanguage.length; i++) {
    const lang = acceptLanguage[i];
    const langCode = lang.code.toLowerCase();
    const langRegion = lang.region ? lang.region.toLowerCase() : lang.region;
    const langScript = lang.script ? lang.script.toLowerCase() : lang.script;
    for (let j = 0; j < supported.length; j++) {
      const supportedCode = supported[j].code.toLowerCase();
      const supportedScript = supported[j].script
        ? supported[j].script.toLowerCase()
        : supported[j].script;
      const supportedRegion = supported[j].region
        ? supported[j].region.toLowerCase()
        : supported[j].region;
      if (
        langCode === supportedCode &&
        (options.loose || !langScript || langScript === supportedScript) &&
        (options.loose || !langRegion || langRegion === supportedRegion)
      ) {
        return supportedLanguages[j];
      }
    }
  }

  return null;
}
