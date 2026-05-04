// MotherDuck integration runtime: token persistence + DuckDB query helpers.
//
// Token lives in `<workspace>/.groove/motherduck.json`. `.groove/` is gitignored
// so the bearer token does not leak via git. Connections are short-lived: a
// fresh `duckdb::Connection` is opened per command so that token updates take
// effect immediately and we don't hold open network sockets.

const MOTHERDUCK_SETTINGS_FILENAME: &str = "motherduck.json";
const MOTHERDUCK_QUERY_DEFAULT_ROW_LIMIT: usize = 10_000;

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct MotherduckSettings {
    #[serde(default = "default_motherduck_settings_version")]
    version: i64,
    #[serde(default)]
    bearer_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    default_database: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    updated_at: Option<String>,
}

fn default_motherduck_settings_version() -> i64 {
    1
}

fn motherduck_settings_path(workspace_root: &Path) -> PathBuf {
    workspace_root
        .join(".groove")
        .join(MOTHERDUCK_SETTINGS_FILENAME)
}

fn read_motherduck_settings(workspace_root: &Path) -> Result<Option<MotherduckSettings>, String> {
    let path = motherduck_settings_path(workspace_root);
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(&path).map_err(|error| {
        format!(
            "Failed to read MotherDuck settings at {}: {}",
            path.display(),
            error
        )
    })?;

    let settings: MotherduckSettings = serde_json::from_str(&raw).map_err(|error| {
        format!(
            "Failed to parse MotherDuck settings at {}: {}",
            path.display(),
            error
        )
    })?;

    Ok(Some(settings))
}

fn write_motherduck_settings(
    workspace_root: &Path,
    settings: &MotherduckSettings,
) -> Result<(), String> {
    let path = motherduck_settings_path(workspace_root);
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid MotherDuck settings path".to_string())?;
    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "Failed to create .groove directory {}: {}",
            parent.display(),
            error
        )
    })?;

    let serialized = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("Failed to serialize MotherDuck settings: {}", error))?;

    fs::write(&path, serialized).map_err(|error| {
        format!(
            "Failed to write MotherDuck settings at {}: {}",
            path.display(),
            error
        )
    })?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = fs::metadata(&path) {
            let mut perms = metadata.permissions();
            perms.set_mode(0o600);
            let _ = fs::set_permissions(&path, perms);
        }
    }

    Ok(())
}

fn clear_motherduck_settings(workspace_root: &Path) -> Result<(), String> {
    let path = motherduck_settings_path(workspace_root);
    if !path.exists() {
        return Ok(());
    }
    fs::remove_file(&path).map_err(|error| {
        format!(
            "Failed to remove MotherDuck settings at {}: {}",
            path.display(),
            error
        )
    })
}

fn motherduck_connection_string(database: Option<&str>) -> String {
    match database {
        Some(name) if !name.trim().is_empty() => format!("md:{}", name.trim()),
        _ => "md:".to_string(),
    }
}

fn open_motherduck_connection(
    token: &str,
    database: Option<&str>,
) -> Result<duckdb::Connection, String> {
    if token.trim().is_empty() {
        return Err("MotherDuck bearer token is not configured.".to_string());
    }

    let config = duckdb::Config::default()
        .with("motherduck_token", token)
        .map_err(|error| format!("Failed to configure MotherDuck token: {}", error))?;

    let connection_string = motherduck_connection_string(database);
    duckdb::Connection::open_with_flags(&connection_string, config)
        .map_err(|error| format!("Failed to open MotherDuck connection: {}", error))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MotherduckTestOutcome {
    current_database: String,
    current_user: String,
    latency_ms: u64,
}

fn motherduck_test_connection(
    token: &str,
    database: Option<&str>,
) -> Result<MotherduckTestOutcome, String> {
    let started_at = Instant::now();
    let conn = open_motherduck_connection(token, database)?;

    let mut stmt = conn
        .prepare("SELECT current_database(), current_user")
        .map_err(|error| format!("Failed to prepare MotherDuck test statement: {}", error))?;

    let mut rows = stmt
        .query([])
        .map_err(|error| format!("Failed to execute MotherDuck test query: {}", error))?;

    let row = rows
        .next()
        .map_err(|error| format!("Failed to read MotherDuck test row: {}", error))?
        .ok_or_else(|| "MotherDuck test query returned no rows.".to_string())?;

    let current_database: String = row
        .get(0)
        .map_err(|error| format!("Failed to read current_database: {}", error))?;
    let current_user: String = row
        .get(1)
        .map_err(|error| format!("Failed to read current_user: {}", error))?;

    Ok(MotherduckTestOutcome {
        current_database,
        current_user,
        latency_ms: started_at.elapsed().as_millis() as u64,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MotherduckQueryRows {
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
    row_count: usize,
    truncated: bool,
    latency_ms: u64,
}

fn motherduck_run_query(
    token: &str,
    database: Option<&str>,
    sql: &str,
    row_limit: usize,
) -> Result<MotherduckQueryRows, String> {
    let trimmed_sql = sql.trim();
    if trimmed_sql.is_empty() {
        return Err("SQL statement cannot be empty.".to_string());
    }

    let effective_limit = if row_limit == 0 {
        MOTHERDUCK_QUERY_DEFAULT_ROW_LIMIT
    } else {
        row_limit.min(MOTHERDUCK_QUERY_DEFAULT_ROW_LIMIT)
    };

    let started_at = Instant::now();
    let conn = open_motherduck_connection(token, database)?;

    let mut stmt = conn
        .prepare(trimmed_sql)
        .map_err(|error| format!("Failed to prepare MotherDuck query: {}", error))?;

    let mut rows_iter = stmt
        .query([])
        .map_err(|error| format!("Failed to execute MotherDuck query: {}", error))?;

    // Column metadata is only valid after the statement has been executed.
    // Pull it from the executed statement reference held by the Rows iterator.
    let (column_count, columns): (usize, Vec<String>) = match rows_iter.as_ref() {
        Some(executed_stmt) => {
            let count = executed_stmt.column_count();
            let names = (0..count)
                .map(|index| {
                    executed_stmt
                        .column_name(index)
                        .map(|name| name.to_string())
                        .unwrap_or_else(|_| format!("column_{}", index))
                })
                .collect();
            (count, names)
        }
        None => (0, Vec::new()),
    };

    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut truncated = false;

    loop {
        match rows_iter.next() {
            Ok(Some(row)) => {
                if rows.len() >= effective_limit {
                    truncated = true;
                    break;
                }
                let mut record: Vec<String> = Vec::with_capacity(column_count);
                for index in 0..column_count {
                    let value: duckdb::types::Value = row.get(index).map_err(|error| {
                        format!("Failed to read column {} value: {}", index, error)
                    })?;
                    record.push(motherduck_value_to_string(&value));
                }
                rows.push(record);
            }
            Ok(None) => break,
            Err(error) => {
                return Err(format!("Failed to read MotherDuck row: {}", error));
            }
        }
    }

    let row_count = rows.len();
    Ok(MotherduckQueryRows {
        columns,
        rows,
        row_count,
        truncated,
        latency_ms: started_at.elapsed().as_millis() as u64,
    })
}

fn motherduck_value_to_string(value: &duckdb::types::Value) -> String {
    use duckdb::types::{TimeUnit, Value};

    fn timestamp_to_iso(unit: TimeUnit, raw: i64) -> String {
        let nanos: i128 = match unit {
            TimeUnit::Second => (raw as i128) * 1_000_000_000,
            TimeUnit::Millisecond => (raw as i128) * 1_000_000,
            TimeUnit::Microsecond => (raw as i128) * 1_000,
            TimeUnit::Nanosecond => raw as i128,
        };
        match OffsetDateTime::from_unix_timestamp_nanos(nanos)
            .ok()
            .and_then(|odt| odt.format(&Rfc3339).ok())
        {
            Some(formatted) => formatted,
            None => format!("{raw}"),
        }
    }

    fn date32_to_iso(days: i32) -> String {
        let seconds = (days as i64).saturating_mul(86_400);
        match OffsetDateTime::from_unix_timestamp(seconds).ok() {
            Some(odt) => {
                let date = odt.date();
                format!(
                    "{:04}-{:02}-{:02}",
                    date.year(),
                    u8::from(date.month()),
                    date.day()
                )
            }
            None => format!("{days}"),
        }
    }

    fn time64_to_string(unit: TimeUnit, raw: i64) -> String {
        let total_nanos = match unit {
            TimeUnit::Second => (raw as i128) * 1_000_000_000,
            TimeUnit::Millisecond => (raw as i128) * 1_000_000,
            TimeUnit::Microsecond => (raw as i128) * 1_000,
            TimeUnit::Nanosecond => raw as i128,
        };
        let total_seconds = total_nanos / 1_000_000_000;
        let nanos = (total_nanos.rem_euclid(1_000_000_000)) as u32;
        let hours = (total_seconds / 3600).rem_euclid(24);
        let minutes = (total_seconds / 60).rem_euclid(60);
        let seconds = total_seconds.rem_euclid(60);
        if nanos == 0 {
            format!("{hours:02}:{minutes:02}:{seconds:02}")
        } else {
            format!("{hours:02}:{minutes:02}:{seconds:02}.{nanos:09}")
        }
    }

    match value {
        Value::Null => "NULL".to_string(),
        Value::Boolean(v) => v.to_string(),
        Value::TinyInt(v) => v.to_string(),
        Value::SmallInt(v) => v.to_string(),
        Value::Int(v) => v.to_string(),
        Value::BigInt(v) => v.to_string(),
        Value::HugeInt(v) => v.to_string(),
        Value::UTinyInt(v) => v.to_string(),
        Value::USmallInt(v) => v.to_string(),
        Value::UInt(v) => v.to_string(),
        Value::UBigInt(v) => v.to_string(),
        Value::Float(v) => v.to_string(),
        Value::Double(v) => v.to_string(),
        Value::Decimal(v) => v.to_string(),
        Value::Text(v) => v.clone(),
        Value::Enum(v) => v.clone(),
        Value::Blob(v) => format!("<blob:{} bytes>", v.len()),
        Value::Date32(days) => date32_to_iso(*days),
        Value::Time64(unit, raw) => time64_to_string(*unit, *raw),
        Value::Timestamp(unit, raw) => timestamp_to_iso(*unit, *raw),
        Value::Interval {
            months,
            days,
            nanos,
        } => format!("{months}mo {days}d {nanos}ns"),
        Value::List(items) | Value::Array(items) => {
            let inner: Vec<String> = items.iter().map(motherduck_value_to_string).collect();
            format!("[{}]", inner.join(", "))
        }
        Value::Struct(map) => {
            let inner: Vec<String> = map
                .iter()
                .map(|(k, v)| format!("{k}: {}", motherduck_value_to_string(v)))
                .collect();
            format!("{{{}}}", inner.join(", "))
        }
        Value::Map(map) => {
            let inner: Vec<String> = map
                .iter()
                .map(|(k, v)| {
                    format!(
                        "{}: {}",
                        motherduck_value_to_string(k),
                        motherduck_value_to_string(v)
                    )
                })
                .collect();
            format!("{{{}}}", inner.join(", "))
        }
        Value::Union(inner) => motherduck_value_to_string(inner),
    }
}

fn motherduck_current_timestamp_iso() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| String::new())
}
