pub(crate) fn run() {
    tauri::Builder::default()
        .manage(WorkspaceEventState::default())
        .manage(TestingEnvironmentState::default())
        .manage(WorkspaceContextCacheState::default())
        .manage(GrooveListCacheState::default())
        .manage(GrooveBinStatusState::default())
        .manage(GrooveTerminalState::default())
        .setup(|app| {
            let status = evaluate_groove_bin_check_status(&app.handle());
            if status.has_issue {
                eprintln!(
                    "[startup-warning] GROOVE_BIN is invalid and may break groove command execution: {}",
                    status.configured_path.as_deref().unwrap_or("<unset>")
                );
            }

            let state = app.state::<GrooveBinStatusState>();
            if let Ok(mut stored) = state.status.lock() {
                *stored = Some(status);
            }

            let _ = ensure_global_settings(&app.handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workspace_pick_and_open,
            workspace_open,
            workspace_get_active,
            workspace_clear_active,
            workspace_gitignore_sanity_check,
            workspace_gitignore_sanity_apply,
            global_settings_get,
            global_settings_update,
            workspace_update_terminal_settings,
            workspace_update_commands_settings,
            workspace_update_worktree_symlink_paths,
            workspace_list_symlink_entries,
            workspace_open_terminal,
            workspace_open_workspace_terminal,
            groove_terminal_open,
            groove_terminal_write,
            groove_terminal_resize,
            groove_terminal_close,
            groove_terminal_get_session,
            groove_terminal_list_sessions,
            git_auth_status,
            git_status,
            git_current_branch,
            git_list_branches,
            git_ahead_behind,
            git_pull,
            git_push,
            git_merge,
            git_merge_abort,
            git_has_staged_changes,
            git_merge_in_progress,
            git_has_upstream,
            git_list_file_states,
            git_stage_files,
            git_unstage_files,
            git_add,
            git_commit,
            gh_detect_repo,
            gh_auth_status,
            gh_auth_logout,
            gh_pr_list,
            gh_pr_create,
            open_external_url,
            gh_open_branch,
            gh_open_active_pr,
            gh_check_branch_pr,
            groove_list,
            groove_new,
            groove_restore,
            groove_rm,
            groove_stop,
            testing_environment_get_status,
            testing_environment_set_target,
            testing_environment_start,
            testing_environment_start_separate_terminal,
            testing_environment_stop,
            groove_bin_status,
            groove_bin_repair,
            diagnostics_list_opencode_instances,
            diagnostics_stop_process,
            diagnostics_stop_all_opencode_instances,
            diagnostics_stop_all_non_worktree_opencode_instances,
            diagnostics_list_worktree_node_apps,
            diagnostics_clean_all_dev_servers,
            diagnostics_get_msot_consuming_programs,
            diagnostics_get_system_overview,
            workspace_events
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
