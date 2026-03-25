-- Allow 'mcp' as a valid channel for Marcus threads and messages.
-- The MCP server sends channel: "mcp" when chatting with Marcus.

alter table kinetiks_marcus_threads
  drop constraint kinetiks_marcus_threads_channel_check;

alter table kinetiks_marcus_threads
  add constraint kinetiks_marcus_threads_channel_check
  check (channel in ('web', 'slack', 'pill', 'mcp'));

alter table kinetiks_marcus_messages
  drop constraint kinetiks_marcus_messages_channel_check;

alter table kinetiks_marcus_messages
  add constraint kinetiks_marcus_messages_channel_check
  check (channel in ('web', 'slack', 'pill', 'mcp'));
