import 'reflect-metadata';
import Container from 'typedi';
import { validationMetadatasToSchemas } from 'class-validator-jsonschema';
import { App, HttpResponse } from 'uWebSockets.js';
import { Modules } from './decorators.js';
import { Ctx, outputSchema } from './common.js';

interface IMotuOption {
  routes: Record<string, Record<string, Function>>;
  name?: string;
  port?: number;
  CORS_HEADERS?: Record<string, string>;
}

interface IBody {
    e: string,
    m: string,
    args: any[]
  }

const _CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH',
  'Access-Control-Allow-Headers': '*'
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
          res.writeHeader('Content-Type', 'application/json');
          if(!data) throw 'Body is required';
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
  const schemas = validationMetadatasToSchemas();
  const server = App();
  server.options('/*', (res) => {
    set(res, CORS_HEADERS);
    res.end('Departed');
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
        const body: IBody = await readJson(res);
        const Controller = Module[body.e];
        if (!Controller) {
          throw { status: 404, message: body.e + ' controller not found' };
        }

        const ctx = {
            headers: {get: req.getHeader},
            _headers: CORS_HEADERS,
            status: 200,
            set: function(headers) {
              this._headers = headers;
            }
          };
          Container.set(Ctx, ctx);
          const Entity = Container.get(Controller);
          const handler = Entity?.[body.m];
          if (!handler) {
            throw { status: 404, message: `Can not found handler under ${body.e}/${body.m}` };
          }
          let toSend = await handler.apply(Entity, body.args || []);
          set(res, { ...CORS_HEADERS, ...ctx._headers })
          const status = ctx.status?.toString() || '200';
          if (typeof res === 'string') {
            toSend = { message: res };
          }
          res.writeStatus(status).end(JSON.stringify(toSend));
      } catch (err) {
        set(res, CORS_HEADERS);
        const error = { message: err.message || 'Unknown Error', err };
        res.writeStatus(err.status?.toString() || '400').end(JSON.stringify(error));
      }
    });
  }

  server.listen(PORT, (isListening) => {
    if (isListening) {
      console.log(`${name} Server is port  ${PORT}`);
    }
  });
}
