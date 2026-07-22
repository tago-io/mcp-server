/** Maps v4 tool names to stable semantic operation IDs, the shared vocabulary the frozen dataset pins expected operations against. */

interface NormalizedCall {
  name: string;
  arguments?: Record<string, unknown>;
}

const NEW_TOOL_MAP = {
  search_devices: "devices.search",
  get_device: "devices.get",
  create_device: "devices.create",
  update_device: "devices.update",
  delete_device: "devices.delete",
  configure_device: "devices.configure",
  read_device_data: "device_data.read",
  send_device_data: "device_data.send",
  edit_device_data: "device_data.edit",
  delete_device_data: "device_data.delete",
  search_actions: "actions.search",
  get_action: "actions.get",
  create_action: "actions.create",
  update_action: "actions.update",
  delete_action: "actions.delete",
  search_analyses: "analyses.search",
  get_analysis: "analyses.get",
  create_analysis: "analyses.create",
  update_analysis: "analyses.update",
  delete_analysis: "analyses.delete",
  upload_analysis_script: "analyses.upload_script",
  download_analysis_script: "analyses.download_script",
  run_analysis: "analyses.run",
  read_analysis_console: "analyses.read_console",
  search_dashboards: "dashboards.search",
  get_dashboard: "dashboards.get",
  create_dashboard: "dashboards.create",
  update_dashboard: "dashboards.update",
  delete_dashboard: "dashboards.delete",
  get_widget: "widgets.get",
  create_widget: "widgets.create",
  update_widget: "widgets.update",
  delete_widget: "widgets.delete",
  widget_schema_lookup: "widgets.schema_lookup",
  validate_widget_configuration: "widgets.validate_configuration",
  get_custom_widget_code: "widgets.get_code",
  upload_custom_widget_code: "widgets.upload_code",
  search_entities: "entities.search",
  get_entity: "entities.get",
  create_entity: "entities.create",
  update_entity: "entities.update",
  delete_entity: "entities.delete",
  update_entity_schema: "entities.update_schema",
  read_entity_data: "entities.read_data",
  send_entity_data: "entities.send_data",
  edit_entity_data: "entities.edit_data",
  delete_entity_data: "entities.delete_data",
  empty_entity_data: "entities.empty_data",
  search_run_users: "run_users.search",
  get_run_user: "run_users.get",
  create_run_user: "run_users.create",
  update_run_user: "run_users.update",
  delete_run_user: "run_users.delete",
  read_run_user_notifications: "run_users.notifications_read",
  send_run_user_notification: "run_users.notification_send",
  update_run_user_notification: "run_users.notification_update",
  delete_run_user_notification: "run_users.notification_delete",
  login_as_run_user: "run_users.login",
  get_profile: "profile.get",
  get_profile_limits: "profile.limits",
  get_profile_statistics: "profile.statistics",
  search_secrets: "secrets.search",
  search_connectors: "integrations.search_connectors",
  get_connector: "integrations.get_connector",
  search_networks: "integrations.search_networks",
  get_network: "integrations.get_network",
  search_docs: "docs.search",
  read_doc: "docs.read",
  platform_overview: "docs.overview",
  search_code_examples: "code_examples.search",
  get_code_example: "code_examples.get",
} as const;

type SemanticOperation = (typeof NEW_TOOL_MAP)[keyof typeof NEW_TOOL_MAP];

function normalizeToolCall(call: NormalizedCall): SemanticOperation | undefined {
  return NEW_TOOL_MAP[call.name as keyof typeof NEW_TOOL_MAP];
}

export { NEW_TOOL_MAP, NormalizedCall, SemanticOperation, normalizeToolCall };
