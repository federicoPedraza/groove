// Intelligence query store: named SQL snippets (tickets-oriented) the user can
// save, list, and re-run. Persisted at <workspace>/.groove/intelligence-queries.json.

const INTELLIGENCE_QUERY_NAME_MAX: usize = 80;
const INTELLIGENCE_QUERY_SQL_MAX: usize = 16_000;
const INTELLIGENCE_QUERY_STORE_VERSION: u32 = 1;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct IntelligenceQueryRecord {
    id: String,
    name: String,
    sql: String,
    color: String,
    icon: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct IntelligenceQueryStore {
    #[serde(default = "default_intelligence_query_store_version")]
    version: u32,
    #[serde(default)]
    queries: Vec<IntelligenceQueryRecord>,
}

fn default_intelligence_query_store_version() -> u32 {
    INTELLIGENCE_QUERY_STORE_VERSION
}

impl Default for IntelligenceQueryStore {
    fn default() -> Self {
        Self {
            version: INTELLIGENCE_QUERY_STORE_VERSION,
            queries: Vec::new(),
        }
    }
}

fn intelligence_query_store_path(workspace_root: &Path) -> PathBuf {
    workspace_root
        .join(".groove")
        .join("intelligence-queries.json")
}

fn read_intelligence_query_store(
    workspace_root: &Path,
) -> Result<IntelligenceQueryStore, String> {
    let path = intelligence_query_store_path(workspace_root);
    if !path_is_file(&path) {
        return Ok(IntelligenceQueryStore::default());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    if raw.trim().is_empty() {
        return Ok(IntelligenceQueryStore::default());
    }
    serde_json::from_str::<IntelligenceQueryStore>(&raw)
        .map_err(|error| format!("Failed to parse {}: {error}", path.display()))
}

fn write_intelligence_query_store(
    workspace_root: &Path,
    store: &IntelligenceQueryStore,
) -> Result<(), String> {
    let groove_dir = workspace_root.join(".groove");
    fs::create_dir_all(&groove_dir)
        .map_err(|error| format!("Failed to create {}: {error}", groove_dir.display()))?;
    let path = intelligence_query_store_path(workspace_root);
    let body = serde_json::to_string_pretty(store)
        .map_err(|error| format!("Failed to serialize intelligence query store: {error}"))?;
    fs::write(&path, body)
        .map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

fn intelligence_query_now_iso() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn intelligence_query_sort(records: &mut [IntelligenceQueryRecord]) {
    // Most-recently updated first — matches how the user thinks about "what
    // I was using last."
    records.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct IntelligenceQueryListResponse {
    request_id: String,
    ok: bool,
    #[serde(default)]
    queries: Vec<IntelligenceQueryRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IntelligenceQuerySaveRequest {
    /// When `Some`, update an existing record by id; otherwise insert a new one.
    #[serde(default)]
    id: Option<String>,
    name: String,
    sql: String,
    color: String,
    icon: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct IntelligenceQuerySaveResponse {
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    saved_id: Option<String>,
    #[serde(default)]
    queries: Vec<IntelligenceQueryRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IntelligenceQueryDeleteRequest {
    id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct IntelligenceQueryDeleteResponse {
    request_id: String,
    ok: bool,
    #[serde(default)]
    queries: Vec<IntelligenceQueryRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn intelligence_query_list_blocking(
    app: AppHandle,
    request_id: String,
) -> IntelligenceQueryListResponse {
    let workspace_root = match active_workspace_root_from_state(&app) {
        Ok(value) => value,
        Err(error) => {
            return IntelligenceQueryListResponse {
                request_id,
                ok: false,
                queries: Vec::new(),
                error: Some(error),
            };
        }
    };

    let mut store = match read_intelligence_query_store(&workspace_root) {
        Ok(store) => store,
        Err(error) => {
            return IntelligenceQueryListResponse {
                request_id,
                ok: false,
                queries: Vec::new(),
                error: Some(error),
            };
        }
    };

    intelligence_query_sort(&mut store.queries);

    IntelligenceQueryListResponse {
        request_id,
        ok: true,
        queries: store.queries,
        error: None,
    }
}

fn intelligence_query_save_blocking(
    app: AppHandle,
    payload: IntelligenceQuerySaveRequest,
    request_id: String,
) -> IntelligenceQuerySaveResponse {
    let name = payload.name.trim();
    if name.is_empty() {
        return IntelligenceQuerySaveResponse {
            request_id,
            ok: false,
            saved_id: None,
            queries: Vec::new(),
            error: Some("Query name cannot be empty.".to_string()),
        };
    }
    if name.chars().count() > INTELLIGENCE_QUERY_NAME_MAX {
        return IntelligenceQuerySaveResponse {
            request_id,
            ok: false,
            saved_id: None,
            queries: Vec::new(),
            error: Some(format!(
                "Query name is too long (max {INTELLIGENCE_QUERY_NAME_MAX} characters)."
            )),
        };
    }

    let sql = payload.sql.trim();
    if sql.is_empty() {
        return IntelligenceQuerySaveResponse {
            request_id,
            ok: false,
            saved_id: None,
            queries: Vec::new(),
            error: Some("SQL cannot be empty.".to_string()),
        };
    }
    if sql.len() > INTELLIGENCE_QUERY_SQL_MAX {
        return IntelligenceQuerySaveResponse {
            request_id,
            ok: false,
            saved_id: None,
            queries: Vec::new(),
            error: Some(format!(
                "SQL is too long (max {INTELLIGENCE_QUERY_SQL_MAX} characters)."
            )),
        };
    }

    let color = payload.color.trim();
    if color.is_empty() {
        return IntelligenceQuerySaveResponse {
            request_id,
            ok: false,
            saved_id: None,
            queries: Vec::new(),
            error: Some("Color is required.".to_string()),
        };
    }
    let icon = payload.icon.trim();
    if icon.is_empty() {
        return IntelligenceQuerySaveResponse {
            request_id,
            ok: false,
            saved_id: None,
            queries: Vec::new(),
            error: Some("Icon is required.".to_string()),
        };
    }

    let workspace_root = match active_workspace_root_from_state(&app) {
        Ok(value) => value,
        Err(error) => {
            return IntelligenceQuerySaveResponse {
                request_id,
                ok: false,
                saved_id: None,
                queries: Vec::new(),
                error: Some(error),
            };
        }
    };

    let mut store = match read_intelligence_query_store(&workspace_root) {
        Ok(store) => store,
        Err(error) => {
            return IntelligenceQuerySaveResponse {
                request_id,
                ok: false,
                saved_id: None,
                queries: Vec::new(),
                error: Some(error),
            };
        }
    };

    let now = intelligence_query_now_iso();
    let saved_id = match payload.id.as_deref().map(str::trim) {
        Some(id) if !id.is_empty() => {
            let mut existing_index: Option<usize> = None;
            for (idx, record) in store.queries.iter().enumerate() {
                if record.id == id {
                    existing_index = Some(idx);
                    break;
                }
            }
            match existing_index {
                Some(idx) => {
                    let record = &mut store.queries[idx];
                    record.name = name.to_string();
                    record.sql = sql.to_string();
                    record.color = color.to_string();
                    record.icon = icon.to_string();
                    record.updated_at = now.clone();
                    record.id.clone()
                }
                None => {
                    return IntelligenceQuerySaveResponse {
                        request_id,
                        ok: false,
                        saved_id: None,
                        queries: Vec::new(),
                        error: Some(format!("No query with id '{id}' exists.")),
                    };
                }
            }
        }
        _ => {
            let new_record = IntelligenceQueryRecord {
                id: Uuid::new_v4().to_string(),
                name: name.to_string(),
                sql: sql.to_string(),
                color: color.to_string(),
                icon: icon.to_string(),
                created_at: now.clone(),
                updated_at: now.clone(),
            };
            let id = new_record.id.clone();
            store.queries.push(new_record);
            id
        }
    };

    if let Err(error) = write_intelligence_query_store(&workspace_root, &store) {
        return IntelligenceQuerySaveResponse {
            request_id,
            ok: false,
            saved_id: None,
            queries: Vec::new(),
            error: Some(error),
        };
    }

    intelligence_query_sort(&mut store.queries);

    IntelligenceQuerySaveResponse {
        request_id,
        ok: true,
        saved_id: Some(saved_id),
        queries: store.queries,
        error: None,
    }
}

fn intelligence_query_delete_blocking(
    app: AppHandle,
    payload: IntelligenceQueryDeleteRequest,
    request_id: String,
) -> IntelligenceQueryDeleteResponse {
    let id = payload.id.trim();
    if id.is_empty() {
        return IntelligenceQueryDeleteResponse {
            request_id,
            ok: false,
            queries: Vec::new(),
            error: Some("Query id is required.".to_string()),
        };
    }

    let workspace_root = match active_workspace_root_from_state(&app) {
        Ok(value) => value,
        Err(error) => {
            return IntelligenceQueryDeleteResponse {
                request_id,
                ok: false,
                queries: Vec::new(),
                error: Some(error),
            };
        }
    };

    let mut store = match read_intelligence_query_store(&workspace_root) {
        Ok(store) => store,
        Err(error) => {
            return IntelligenceQueryDeleteResponse {
                request_id,
                ok: false,
                queries: Vec::new(),
                error: Some(error),
            };
        }
    };

    let original_len = store.queries.len();
    store.queries.retain(|record| record.id != id);
    if store.queries.len() == original_len {
        return IntelligenceQueryDeleteResponse {
            request_id,
            ok: false,
            queries: Vec::new(),
            error: Some(format!("No query with id '{id}' exists.")),
        };
    }

    if let Err(error) = write_intelligence_query_store(&workspace_root, &store) {
        return IntelligenceQueryDeleteResponse {
            request_id,
            ok: false,
            queries: Vec::new(),
            error: Some(error),
        };
    }

    intelligence_query_sort(&mut store.queries);

    IntelligenceQueryDeleteResponse {
        request_id,
        ok: true,
        queries: store.queries,
        error: None,
    }
}
