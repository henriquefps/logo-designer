// Worker entrypoint. Only the default handler may be exported here: workerd treats every
// named export of the entry module as an entrypoint and rejects non-function values.
import { handle, type Env } from './routing';

export default {
  fetch: (request: Request, env: Env) => handle(request, env),
};
