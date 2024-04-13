import { MongoClient, ServerApiVersion, Db, Collection, type Document } from 'mongodb';
import { Container } from 'typedi';
import { type IEntity } from './common';

const collMap: Record<string, Collection<Document>> = {};
export let client: MongoClient | null = null,
  db: Db | null = null;

export async function connect(uri = process.env.MONGO_URI || 'mongodb://localhost:27017', dbName = process.env.MONGO_DB || 'motu') {
  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true
    }
  });
  await client.connect();
  console.log('db connected');
  // client.topology.isConnected();
  db = client.db(dbName);
  const collections = await db.listCollections({ type: 'collection' }, { nameOnly: true }).toArray();
  for (const col of collections) {
    collMap[col.name] = db.collection(col.name);
    Container.set(col.name, collMap[col.name]);
  }
  return client;
}

async function createIndex(collName: string, indexes?: IEntity['indexes']) {
  if (indexes?.length) {
    for (const index of indexes) {
      await collMap[collName].createIndex(index.keys, index.option);
    }
  }
}

export async function Model<T extends Document = Document>(
  name: string,
  validator: object,
  indexes?: IEntity['indexes'],
  modify = false
): Promise<Collection<T>> {
  if (!db) throw new Error('Either client not connected or Database not found');
  if (!collMap[name]) {
    collMap[name] = await db.createCollection(name, { validator });
    await createIndex(name, indexes);
    Container.set(name, collMap[name]);
  }
  if (modify) {
    await db.command({ collMod: name, validator });
    await collMap[name].dropIndexes();
    await createIndex(name, indexes);
  }
  return collMap[name] as unknown as Collection<T>;
}

export function registerModels(models: { entity: IEntity; validator: object }[]): void {
  models.forEach((e) => {
    const name = e.entity.name;
    Model(name, e.validator, e.entity.indexes);
  });
}