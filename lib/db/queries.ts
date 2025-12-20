import { getDb, Database } from "./index";
import { getTap } from "@/lib/tap";
import { AccountTable, StatusTable } from "./schema";
import { AtUri } from "@atproto/syntax";

// Read queries

export async function getRecentStatuses() {
  const db = getDb();
  const statuses = await db
    .selectFrom("status")
    .innerJoin("account", "status.authorDid", "account.did")
    .selectAll()
    .where("current", "=", 1)
    .orderBy("createdAt", "desc")
    .limit(20)
    .execute();
  return statuses;
}

export async function getTopStatuses(limit = 10) {
  const db = getDb();
  const topStatuses = await db
    .selectFrom("status")
    .select(["status", db.fn.count("uri").as("count")])
    .where("current", "=", 1)
    .groupBy("status")
    .orderBy("count", "desc")
    .limit(limit)
    .execute();
  return topStatuses;
}

export async function getAccountStatus(did: string) {
  const db = getDb();
  const status = await db
    .selectFrom("status")
    .selectAll()
    .where("authorDid", "=", did)
    .orderBy("createdAt", "desc")
    .limit(1)
    .executeTakeFirst();
  return status ?? null;
}

export async function getAccountHandle(did: string) {
  const db = getDb();
  const account = await db
    .selectFrom("account")
    .select("handle")
    .where("did", "=", did)
    .executeTakeFirst();
  if (account) {
    return account.handle;
  }
  const info = await getTap().getRepoInfo(did);
  await db
    .insertInto("account")
    .values({
      did,
      handle: info.handle,
      active: 1,
    })
    .execute();
  return info.handle;
}

// Write queries
export async function insertStatus(data: StatusTable) {
  getDb()
    .transaction()
    .execute(async (tx) => {
      await tx
        .insertInto("status")
        .values(data)
        .onConflict((oc) =>
          oc.column("uri").doUpdateSet({
            status: data.status,
            createdAt: data.createdAt,
            indexedAt: data.indexedAt,
          }),
        )
        .execute();
      setCurrStatus(tx, data.authorDid);
    });
}

export async function deleteStatus(uri: AtUri) {
  await getDb()
    .transaction()
    .execute(async (tx) => {
      await tx.deleteFrom("status").where("uri", "=", uri.toString()).execute();
      await setCurrStatus(tx, uri.hostname);
    });
}

export async function upsertAccount(data: AccountTable) {
  await getDb()
    .insertInto("account")
    .values(data)
    .onConflict((oc) =>
      oc.column("did").doUpdateSet({
        handle: data.handle,
        active: data.active,
      }),
    )
    .execute();
}

export async function deleteAccount(did: string) {
  getDb()
    .transaction()
    .execute(async (tx) => {
      await tx.deleteFrom("account").where("did", "=", did).execute();
      await tx.deleteFrom("status").where("authorDid", "=", did).execute();
    });
}

// expected inside of transaction
async function setCurrStatus(tx: Database, did: string) {
  await tx
    .updateTable("status")
    .set({ current: 0 })
    .where("authorDid", "=", did)
    .where("current", "=", 1)
    .execute();
  await tx
    .updateTable("status")
    .set({ current: 1 })
    .where("uri", "=", (qb) =>
      qb
        .selectFrom("status")
        .select("uri")
        .where("authorDid", "=", did)
        .orderBy("createdAt", "desc")
        .limit(1),
    )
    .execute();
}
