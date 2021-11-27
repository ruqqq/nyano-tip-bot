import { db } from "./src/db";

beforeAll(async () => db.open());
afterAll(async () => db.close());
