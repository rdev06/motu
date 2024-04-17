import 'reflect-metadata';
import { validationMetadatasToSchemas } from 'class-validator-jsonschema';
import { App, HttpResponse } from 'uWebSockets.js';
import { Modules } from './decorators.js';
import { Ctx, outputSchema } from './common.js';
import { Container } from 'typedi';

interface IMotuOption {
  routes: Record<string, Record<string, new (...args: any[]) => any>>;
  name?: string;
  port?: number;
  whiteListHeaderKeys?: string[];
  CORS_HEADERS?: Record<string, string>;
}

interface IBody {
  e: string;
  m: string;
  args: any[];
}

const _CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'application/json'
};

function set(res: HttpResponse, _headers: Record<string, string>) {
  for (const k in _headers) {
    res.writeHeader(k, _headers[k]);
  }
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
  const schemas = validationMetadatasToSchemas();
  const server = App();
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

  for (const K in option.routes) {
    const Module = option.routes[K];
    server.get(K, (res) => {
      set(res, CORS_HEADERS);
      res.end(JSON.stringify(Modules));
    });

    server.post(K, async (res, req) => {
      try {
        const ctx = {
          headers: {},
          _headers: {},
          status: 200,
          set: function (key: string, value: string) {
            this._headers[key] = value;
          }
        };
        for (const k of headerKeys) {
          ctx.headers[k] = req.getHeader(k);
        }
        const body: IBody = await readJson(res);
        const Controller = Module[body.e];
        if (!Controller) {
          throw { status: 404, message: body.e + ' controller not found' };
        }
        Container.set(Ctx, ctx);
        const Entity = Container.get(Controller);
        const handler = Entity?.[body.m];
        if (!handler) {
          throw { status: 404, message: `Can not found handler under ${body.e}/${body.m}` };
        }
        let toSend = await handler.apply(Entity, body.args || []);
        const status = ctx.status?.toString() || '200';
        if (typeof res === 'string') {
          toSend = { message: res };
        }
        res.cork(() => {
          set(res, { ...CORS_HEADERS, ...ctx._headers });
          res.writeStatus(status).end(JSON.stringify(toSend));
        });
      } catch (err) {
        if (err.hasOwnProperty('stack') || process.env.NODE_ENV != 'prod') {
          if (!err.meta) {
            err.meta = {};
          }
          err.meta.stack = err.stack;
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
    });
  }

  server.listen(PORT, (isListening) => {
    if (isListening) {
      console.log(`${name} Server is port  ${PORT}`);
    }
  });
}
