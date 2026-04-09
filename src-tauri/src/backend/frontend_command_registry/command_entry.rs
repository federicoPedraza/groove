pub(crate) fn run() {
    tauri::Builder::default()
        .manage(WorkspaceEventState::default())
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
            workspace_term_sanity_check,
            workspace_term_sanity_apply,
            workspace_gitignore_sanity_check,
            workspace_gitignore_sanity_apply,
            global_settings_get,
            global_settings_update,
            sound_library_read,
            sound_library_import,
            sound_library_remove,
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
            groove_terminal_check_activity,
            groove_terminal_active_worktrees,
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
            open_external_url,
            groove_list,
            groove_new,
            groove_restore,
            groove_rm,
            groove_stop,
            groove_summary,
            groove_bin_status,
            groove_bin_repair,
            diagnostics_stop_process,
            diagnostics_kill_all_node_instances,
            diagnostics_list_worktree_node_apps,
            diagnostics_clean_all_dev_servers,
            diagnostics_get_msot_consuming_programs,
            diagnostics_get_system_overview,
            workspace_events,
            opencode_integration_status,
            opencode_update_workspace_settings,
            opencode_update_global_settings,
            check_opencode_status,
            validate_opencode_settings_directory,
            opencode_list_skills,
            opencode_copy_skills,
            get_opencode_profile,
            set_opencode_profile,
            sync_opencode_config,
            repair_opencode_integration,
            run_opencode_flow,
            cancel_opencode_flow
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
