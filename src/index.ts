import 'reflect-metadata';
import { Container } from 'typedi';
import { validationMetadatasToSchemas } from 'class-validator-jsonschema';
import { App, HttpResponse } from 'uWebSockets.js';
import { Modules } from './decorators.js';
import { AdditionalInputTypes, Ctx, isObjectEmpty, outputSchema } from './common.js';

interface IMotuOption {
  apis: Record<string, Record<string, new (...args: any[]) => any>>;
  apiPathPrefix?: string;
  redirects?: Record<string, (ctx: Ctx, useParam: (idx: number) => string) => any>;
  name?: string;
  port?: number;
  whiteListHeaderKeys?: string[];
  CORS_HEADERS?: Record<string, string>;
}

interface IBody {
  e: string;
  m: string;
  q: 'query' | 'mutation';
  args: any[];
  project: Ctx['project'];
}

const _CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'application/json'
};

function set(res: HttpResponse, _headers: Ctx['_headers']) {
  for (const k in _headers) {
    let value: string | string[] = _headers[k];
    if (Array.isArray(value)) {
      value = value.join(';');
    }
    res.writeHeader(k, value);
  }
}

function handelError(err: any, CORS_HEADERS: Ctx['_headers'], res: HttpResponse) {
  if (err.hasOwnProperty('stack') || process.env.NODE_ENV != 'prod') {
    if (!err.meta) {
      err.meta = {};
    }
    err.meta.stack = err.stack || err.meta;
  }
  const error: { message: string; err?: any } = { message: err.message || 'Unknown Error' };
  if (process.env.NODE_ENV != 'prod') {
    error.err = err;
  }
  res.cork(() => {
    set(res, CORS_HEADERS);
    res.writeStatus(err.status?.toString() || '400').end(JSON.stringify(error));
  });
}

export function readJson(res: HttpResponse): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    res.onData((chunk, isLast) => {
      data += Buffer.from(chunk);
      if (isLast) {
        try {
          if (!data) throw 'Body is required';
          return resolve(JSON.parse(data));
        } catch (error) {
          res.close();
          return reject(error);
        }
      }
    });
    res.onAborted(() => 'Invalid JSON or no data at all!');
  });
}

export default function motu(option: IMotuOption) {
  const name = option.name || 'default';
  const PORT = Number(process.env.PORT) || option.port || 3000;
  const CORS_HEADERS = option.CORS_HEADERS || _CORS_HEADERS;
  const headerKeys = ['authorization', 'x-api-key'].concat(option.whiteListHeaderKeys || []);
  const schemas = validationMetadatasToSchemas({additionalConverters: AdditionalInputTypes});
  const server = App();

  if(!option.apiPathPrefix) option.apiPathPrefix = '/api';
  if(option.apiPathPrefix === '/') throw `You can not set 'apiPathPrefix' as '/' as this is reserved for internal usage`;

  server.options('/*', (res) => {
    set(res, CORS_HEADERS);
    res.end(JSON.stringify({ message: 'Departed' }));
  });

  server.patch('/*', async (res, req) => {
    const body = await readJson(res);
    set(res, CORS_HEADERS);
    try {
      if (!body.n) throw `Name is required is field name 'n'`;
      let toReturn;
      switch (body.t) {
        case 'i':
          toReturn = schemas[body.n];
          break;
        case 'o':
          toReturn = outputSchema[body.n];
          break;
        default:
          throw 'Unsupported type';
      }
      res.end(JSON.stringify(toReturn));
    } catch (error) {
      res.writeStatus('400').end(JSON.stringify({ message: error }));
    }
  });

  if (!isObjectEmpty(option.redirects)) {
    for (const k in option.redirects) {
      server.get(k, async (res, req) => {
        set(res, CORS_HEADERS);
        try {
          const ctx = Container.get(Ctx);
          for (const k of headerKeys) {
            ctx.headers[k] = req.getHeader(k);
          }
          let toSend = await option.redirects[k](ctx, req.getParameter);
          if (typeof toSend === 'string') {
            toSend = { message: toSend };
          }else if(typeof toSend === 'object'){
            toSend = JSON.stringify(toSend)
          }
          res.cork(() => {
            set(res, { ...CORS_HEADERS, ...ctx._headers });
            res.writeStatus(ctx.status.toString() || '200').end(toSend);
          });
        } catch (err) {
          handelError(err, CORS_HEADERS, res);
        }
      });
    }
  }

  for (const K in option.apis) {
    const Module = option.apis[K];
    let path = option.apiPathPrefix + K;
    if(path.endsWith('/')) path = path.slice(0, -1);

    server.get(path, (res) => {
      set(res, CORS_HEADERS);
      const ThisModuleKeys = Object.keys(Module);
      // Now bring the values of this Module keys from Modules and send it;
      const toSend = ThisModuleKeys.reduce((pre, k) => {
        pre[k] = Modules[Module[k].name];
        return pre;
      }, {});
      res.end(JSON.stringify(toSend));
    });

    server.post(path, async (res, req) => {
      try {
        const ctx = { headers: {}, project: {} };
        for (const k of headerKeys) {
          ctx.headers[k] = req.getHeader(k);
        }
        const body: IBody = await readJson(res);
        const Controller = Module[body.e];
        if (!Controller) {
          throw { status: 404, message: body.e + ' controller not found' };
        }
        ctx.project = body.project || {};

        const Entity = Container.get(Controller);
        const handler = Entity?.[body.m];
        if (!handler) {
          throw { status: 404, message: `Can not found handler under ${body.e}/${body.m}` };
        }
        Entity.ctx = { ...Entity.ctx, ...ctx };
        let toSend = await handler.apply(Entity, body.args || []);
        const status = Entity.ctx.status?.toString() || '200';
        if (typeof toSend === 'string') {
          toSend = { message: toSend };
        }
        res.cork(() => {
          set(res, { ...CORS_HEADERS, ...Entity.ctx._headers });
          res.writeStatus(status).end(JSON.stringify(toSend));
        });
      } catch (err) {
        handelError(err, CORS_HEADERS, res);
      }
    });
  }

  server.listen(PORT, (isListening) => {
    if (isListening) {
      console.log(`${name} Server is port  ${PORT}`);
    }
  });
}
