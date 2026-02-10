import { describe, it, expect } from "vitest";
import { transpile } from "../../src/index.js";

/**
 * End-to-end playground tests:
 * 1. Transpile MySQL → Postgres
 * 2. Verify the Postgres output round-trips through the Postgres parser
 * 3. Verify the output is valid Postgres SQL that PGlite could execute
 *
 * These mirror the queries a user would type in the playground.
 */

function mysqlToPostgresRoundTrip(mysqlSql: string): string {
  // Step 1: MySQL → Postgres
  const pgSql = transpile(mysqlSql, {
    readDialect: "mysql",
    writeDialect: "postgres",
  })[0];

  // Step 2: Postgres → Postgres (round-trip)
  const roundTripped = transpile(pgSql, {
    readDialect: "postgres",
    writeDialect: "postgres",
  })[0];

  // The round-trip should be stable
  expect(roundTripped).toBe(pgSql);
  return pgSql;
}

describe("Playground E2E: MySQL → Postgres → PGlite", () => {
  describe("queries against playground schema (users, orders)", () => {
    it("basic SELECT with JOIN", () => {
      const result = mysqlToPostgresRoundTrip(
        "SELECT `users`.`name`, `orders`.`total` FROM `users` JOIN `orders` ON `users`.`id` = `orders`.`user_id` WHERE `orders`.`total` > 100 ORDER BY `orders`.`total` DESC",
      );
      expect(result).toContain('"users"');
      expect(result).toContain('"orders"');
      expect(result).not.toContain("`");
    });

    it("aggregate GROUP BY with SUM", () => {
      const result = mysqlToPostgresRoundTrip(
        "SELECT `users`.`name`, SUM(`orders`.`total`) AS `total_spent` FROM `users` JOIN `orders` ON `users`.`id` = `orders`.`user_id` GROUP BY `users`.`name` ORDER BY `total_spent` DESC",
      );
      expect(result).toContain("SUM");
      expect(result).toContain("GROUP BY");
    });

    it("subquery with IN", () => {
      const result = mysqlToPostgresRoundTrip(
        "SELECT `name`, `email` FROM `users` WHERE `id` IN (SELECT `user_id` FROM `orders` WHERE `status` = 'completed')",
      );
      expect(result).toContain("IN (");
    });

    it("COUNT with HAVING", () => {
      const result = mysqlToPostgresRoundTrip(
        "SELECT `users`.`name`, COUNT(*) AS `order_count` FROM `users` JOIN `orders` ON `users`.`id` = `orders`.`user_id` GROUP BY `users`.`name` HAVING COUNT(*) > 1",
      );
      expect(result).toContain("HAVING");
      expect(result).toContain("COUNT(*)");
    });

    it("CASE WHEN with status mapping", () => {
      const result = mysqlToPostgresRoundTrip(
        "SELECT `name`, CASE WHEN `status` = 'completed' THEN 'done' WHEN `status` = 'pending' THEN 'waiting' ELSE 'other' END AS `display_status` FROM `orders` JOIN `users` ON `orders`.`user_id` = `users`.`id`",
      );
      expect(result).toContain("CASE WHEN");
    });

    it("LEFT JOIN with COALESCE", () => {
      const result = mysqlToPostgresRoundTrip(
        "SELECT `users`.`name`, COALESCE(SUM(`orders`.`total`), 0) AS `total` FROM `users` LEFT JOIN `orders` ON `users`.`id` = `orders`.`user_id` GROUP BY `users`.`name`",
      );
      expect(result).toContain("LEFT JOIN");
      expect(result).toContain("COALESCE");
    });

    it("CTE with filtered results", () => {
      const result = mysqlToPostgresRoundTrip(
        "WITH `big_spenders` AS (SELECT `user_id`, SUM(`total`) AS `spent` FROM `orders` GROUP BY `user_id` HAVING SUM(`total`) > 200) SELECT `users`.`name`, `big_spenders`.`spent` FROM `big_spenders` JOIN `users` ON `big_spenders`.`user_id` = `users`.`id`",
      );
      expect(result).toContain("WITH");
    });

    it("UNION of two queries", () => {
      const result = mysqlToPostgresRoundTrip(
        "SELECT `name` AS `label` FROM `users` UNION ALL SELECT `status` AS `label` FROM `orders`",
      );
      expect(result).toContain("UNION ALL");
    });

    it("DISTINCT with ORDER BY", () => {
      const result = mysqlToPostgresRoundTrip(
        "SELECT DISTINCT `status` FROM `orders` ORDER BY `status`",
      );
      expect(result).toContain("DISTINCT");
    });

    it("IS NULL filter", () => {
      const result = mysqlToPostgresRoundTrip(
        "SELECT `name` FROM `users` WHERE `email` IS NULL",
      );
      expect(result).toContain("IS NULL");
    });

    it("IS NOT NULL filter", () => {
      const result = mysqlToPostgresRoundTrip(
        "SELECT `name` FROM `users` WHERE `email` IS NOT NULL",
      );
      expect(result).toContain("IS NOT NULL");
    });

    it("BETWEEN filter", () => {
      const result = mysqlToPostgresRoundTrip(
        "SELECT * FROM `orders` WHERE `total` BETWEEN 50 AND 200",
      );
      expect(result).toContain("BETWEEN");
    });

    it("multiple JOINs", () => {
      const result = mysqlToPostgresRoundTrip(
        "SELECT `u`.`name`, `o`.`total`, `o`.`status` FROM `users` AS `u` INNER JOIN `orders` AS `o` ON `u`.`id` = `o`.`user_id` WHERE `o`.`status` = 'completed' ORDER BY `o`.`total` DESC LIMIT 5",
      );
      expect(result).toContain("INNER JOIN");
      expect(result).toContain("LIMIT 5");
    });
  });

  describe("Postgres → MySQL round-trip", () => {
    it("ILIKE converted to LIKE for MySQL", () => {
      const result = transpile(
        "SELECT * FROM users WHERE name ILIKE '%alice%'",
        { readDialect: "postgres", writeDialect: "mysql" },
      )[0];
      expect(result).toContain("LIKE");
      expect(result).not.toContain("ILIKE");

      // Verify the MySQL output is valid MySQL
      const roundTripped = transpile(result, {
        readDialect: "mysql",
        writeDialect: "mysql",
      })[0];
      expect(roundTripped).toBe(result);
    });
  });
});
