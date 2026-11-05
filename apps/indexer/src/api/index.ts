import { Hono } from "hono";
import { graphql } from "ponder";
import { db } from "ponder:api";
import schema from "ponder:schema";

// Read-only GraphQL over the indexed tables (http://localhost:42069/graphql).
// The web app reads through the NestJS API instead, which adds roles and off-chain data.
const app = new Hono();

app.use("/graphql", graphql({ db, schema }));

export default app;
