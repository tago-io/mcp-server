import { IToolConfig } from "../../types";
import { createSqlQueryConfigJSON } from "./create-sql-query";
import { deleteSqlQueryConfigJSON } from "./delete-sql-query";
import { executeSqlQueryConfigJSON } from "./execute-sql-query";
import { getSqlQueryConfigJSON } from "./get-sql-query";
import { getSqlQueryVersionConfigJSON } from "./get-sql-query-version";
import { lookupSqlTablesConfigJSON } from "./lookup-sql-tables";
import { searchSqlQueriesConfigJSON } from "./search-sql-queries";
import { updateSqlQueryConfigJSON } from "./update-sql-query";

const sqlTools: IToolConfig[] = [
  searchSqlQueriesConfigJSON,
  getSqlQueryConfigJSON,
  createSqlQueryConfigJSON,
  updateSqlQueryConfigJSON,
  deleteSqlQueryConfigJSON,
  getSqlQueryVersionConfigJSON,
  executeSqlQueryConfigJSON,
  lookupSqlTablesConfigJSON,
];

export { sqlTools };
