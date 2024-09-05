import { Collection, ObjectId } from 'mongodb';
import { Container } from 'typedi';
import { isObjectEmpty } from './common';

/*
 *  @colFlnProjectKeyPrmiseMap {
 *   User : {
 *          createdBy : {
 *                  project : {_id: 1, name: 1, email: 1},
 *                  key: {
 *                            '52c67890n3c1ab89ca': promise{resolve, reject}
 *                      }
 *              }
 *      }
 * }
 *
 *  @project should be in flat structure, or else things will not work or break
 */
export type IProject = Record<string, string | number | boolean>;
type PromiseResolveFunction = (value?: any | PromiseLike<any>) => void;
type PromiseRejectFunction = (reason?: any) => void;

export default class MongoLoader {
  init = false;
  colFlnProjectKeyPromiseMap: Record<
    string,
    Record<string, { project: IProject; keys: Record<string, { resolve: PromiseResolveFunction; reject: PromiseRejectFunction }[]> }>
  > = {};
  load(key: string | ObjectId, col: string, fln: string, project: IProject = {}) {
    key = key.toString();
    const self = this;
    const promise = new Promise((resolve, reject) => {
      if (!self.colFlnProjectKeyPromiseMap[col]) self.colFlnProjectKeyPromiseMap[col] = {};
      if (!self.colFlnProjectKeyPromiseMap[col][fln]) {
        // lets make project flat
        // const projection = {};
        // for (const k in project) {
        //   if (typeof project[k] === 'object') projection[k] = 1;
        //   else projection[k] = project[k];
        // }
        self.colFlnProjectKeyPromiseMap[col][fln] = { project, keys: {} };
      }
      if(!self.colFlnProjectKeyPromiseMap[col][fln].keys[key]){
        self.colFlnProjectKeyPromiseMap[col][fln].keys[key] = [];
      }
      self.colFlnProjectKeyPromiseMap[col][fln].keys[key].push({ resolve, reject });
    });
    if (this.init) {
      return promise;
    }
    this.init = true;

    process.nextTick(() => {
      for (const cn in self.colFlnProjectKeyPromiseMap) {
        for (const fl in self.colFlnProjectKeyPromiseMap[cn]) {
          const flObj = self.colFlnProjectKeyPromiseMap[cn][fl];
          const projectHaveId = !!flObj.project._id;
          if (!isObjectEmpty(flObj.project) && !projectHaveId) flObj.project._id = 1;
          const dbCol: Collection = Container.get(cn);
          dbCol
            .find({ _id: { $in: Object.keys(flObj.keys).map((k) => ObjectId.createFromHexString(k)) } }, { projection: flObj.project })
            .toArray()
            .then((DATA) => self.mapper(null, DATA, { cn, fl }, projectHaveId))
            .catch((err) => self.mapper(err, null, { cn, fl }, projectHaveId));
        }
      }
    });

    return promise;
  }
  // follow the approach of error first callback
  mapper(err: any, DATA: Object & { _id: ObjectId }[], { cn, fl }: { cn: string; fl: string }, projectHaveId = true) {
    const isError = !!err;
    const target = this.colFlnProjectKeyPromiseMap[cn][fl].keys;
    // lets clear DATA first, so that when we will iterate at that time we will have less items to handel
    if (DATA) {
      for (const d of DATA) {
        const id = d._id.toHexString();
        if (!projectHaveId) delete d._id;
        target[id].map(e => e.resolve(d));
        delete target[id];
      }
    }
    // Now lets clear remaining

    //***** If race happens then look in this section *****//
    for (const K in target) {
      if (isError) target[K].map(e => e.reject(err));
      else target[K].map(e => e.resolve(null));
    }

    // since we clear all the fields inside that field do lets clear it
    delete this.colFlnProjectKeyPromiseMap[cn][fl];

    //********************************************************/

    // if all fields for collection is empty then delete it also;

    if (isObjectEmpty(this.colFlnProjectKeyPromiseMap[cn])) {
      delete this.colFlnProjectKeyPromiseMap[cn];

      // Again if all collection are gone then lets clear everything
      if (isObjectEmpty(this.colFlnProjectKeyPromiseMap)) {
        this.colFlnProjectKeyPromiseMap = {};
        this.init = false;
      }
    }
  }
}
