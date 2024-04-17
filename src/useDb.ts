import { MongoClient, ServerApiVersion, Db, Collection, type Document } from 'mongodb';
import { Container } from 'typedi';
import { mapEntity, type IEntity } from './common';
import semver from 'semver';

const collMap: Record<string, Collection<Document>> = {};
const ColVersion = 'ColVersion';
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
  if (!collMap[ColVersion]) {
    collMap[ColVersion] = await db.createCollection(ColVersion, {
      validator: {
        $jsonSchema: {
          title: 'Collection Version',
          description: 'Keep records for version of each collection so that we can modify their validations and indexes',
          bsonType: 'object',
          additionalProperties: false,
          required: ['_id', 'name', 'version', 'lastModifiedAt'],
          properties: {
            _id: {
              bsonType: 'objectId'
            },
            name: {
              bsonType: 'string',
              description: 'Collection name'
            },
            version: {
              type: 'string',
              pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+$',
              description: 'Present Collection version as major.minor.patch'
            },
            lastModifiedAt: {
              bsonType: 'date'
            }
          }
        }
      }
    });
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
  currentVersion: string,
  indexes?: IEntity['indexes']
): Promise<Collection<T>> {
  if (!db) throw new Error('Either client not connected or Database not found');
  if (!collMap[name]) {
    try {
      collMap[name] = await db.createCollection(name, { validator });
      await createIndex(name, indexes);
      Container.set(name, collMap[name]);
    } catch (error) {
      console.error(`Error for collection 'Unit':`, error);
      process.exit(1);
    }
  }
  const lastVersion = await collMap[ColVersion].findOne({ name }, { projection: { _id: 0, version: 1 } });
  if (semver.lt(lastVersion?.version || '0.0.0', currentVersion)) {
    await db.command({ collMod: name, validator });
    await collMap[name].dropIndexes();
    await createIndex(name, indexes);
    await collMap[ColVersion].updateOne({ name }, { $set: { version: currentVersion, lastModifiedAt: new Date() } }, { upsert: true });
  }
  return collMap[name] as unknown as Collection<T>;
}

export function registerModels(models: { entity: IEntity; validator: object }[]): void {
  models.forEach((e) => {
    const name = e.entity.name;
    mapEntity([e.entity]);
    Model(name, e.validator, e.entity.version, e.entity.indexes);
  });
}
