import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  _resetActionClassRegistryForTests,
  registerActionClass,
} from "@kinetiks/tools";
import type { ActionClassDescriptor, KineticsAppManifest } from "@kinetiks/types";

import { ManifestValidationError, validateManifest } from "../validate";

/**
 * Manifest validator tests per the Kinetiks Contract Addendum §2.6.
 *
 * The validator runs at app boot. Every rejection path here surfaces
 * as a hard startup failure with a clear, actionable error message —
 * not as a runtime surprise when a customer hits the Permissions step.
 */

afterEach(() => {
  _resetActionClassRegistryForTests();
});

const validClass = (overrides: Partial<ActionClassDescriptor> = {}): ActionClassDescriptor => ({
  action_class: "test.notify",
  source_app: "test",
  description: "Test notification action class",
  constraint_schema: z.object({
    max_per_day: z.number().int().positive(),
    channel: z.string().min(1),
  }),
  rate_limit_default: { count: 100, window: "day" },
  customer_template: "Send notifications via {channel} up to {max_per_day} per day.",
  available_in_default_standing_grants: true,
  always_requires_budget_attachment: false,
  ...overrides,
});

const validManifest = (overrides: Partial<KineticsAppManifest> = {}): KineticsAppManifest => ({
  app: "test",
  display: { name: "Test", tagline: "Test app", color: "#000" },
  default_standing_grants: [
    {
      key: "test_default_one",
      description: "Let the system send you notifications.",
      granted_capabilities: [
        {
          action_class: "test.notify",
          description: "Send you helpful notifications.",
          constraints: { max_per_day: 10, channel: "dm" },
          rate_limit: { count: 10, window: "day" },
        },
      ],
      escalation_triggers: [],
      expires_at: null,
    },
  ],
  ...overrides,
});

describe("validateManifest", () => {
  beforeEach(() => {
    registerActionClass(validClass());
  });

  it("accepts a well-formed manifest", () => {
    expect(() => validateManifest(validManifest())).not.toThrow();
  });

  it("accepts a manifest with no defaults declared", () => {
    expect(() =>
      validateManifest({
        app: "noop_app",
        display: { name: "noop", tagline: "noop", color: "#fff" },
      }),
    ).not.toThrow();
  });

  it("rejects an invalid app key", () => {
    expect(() =>
      validateManifest({
        ...validManifest(),
        app: "BadApp-Key",
      }),
    ).toThrow(/\.app must match/);
  });

  it("rejects an empty display.name", () => {
    expect(() =>
      validateManifest({
        ...validManifest(),
        display: { name: "", tagline: "x", color: "#000" },
      }),
    ).toThrow(/missing display\.name/);
  });

  it("rejects a default with an invalid key shape", () => {
    expect(() =>
      validateManifest({
        ...validManifest(),
        default_standing_grants: [
          {
            key: "BadKey",
            description: "x",
            granted_capabilities: [
              {
                action_class: "test.notify",
                description: "x",
                constraints: { max_per_day: 1, channel: "dm" },
                rate_limit: null,
              },
            ],
            escalation_triggers: [],
            expires_at: null,
          },
        ],
      }),
    ).toThrow(/\.key must match/);
  });

  it("rejects duplicate keys within a manifest", () => {
    const dup = {
      ...validManifest().default_standing_grants![0],
      key: "test_default_one",
    };
    expect(() =>
      validateManifest({
        ...validManifest(),
        default_standing_grants: [dup, dup],
      }),
    ).toThrow(/declared more than once/);
  });

  it("rejects a description containing 'Authority Grant'", () => {
    expect(() =>
      validateManifest({
        ...validManifest(),
        default_standing_grants: [
          {
            ...validManifest().default_standing_grants![0],
            description: "Set up your Authority Grant for notifications.",
          },
        ],
      }),
    ).toThrow(/banned phrase "Authority Grant"/);
  });

  it("rejects an action_class flagged available_in_default_standing_grants=false", () => {
    _resetActionClassRegistryForTests();
    registerActionClass(
      validClass({
        action_class: "test.notify",
        available_in_default_standing_grants: false,
      }),
    );
    expect(() => validateManifest(validManifest())).toThrow(
      /available_in_default_standing_grants=false/,
    );
  });

  it("rejects an unregistered action_class", () => {
    expect(() =>
      validateManifest({
        ...validManifest(),
        default_standing_grants: [
          {
            ...validManifest().default_standing_grants![0],
            granted_capabilities: [
              {
                action_class: "test.unknown",
                description: "x",
                constraints: { max_per_day: 1, channel: "dm" },
                rate_limit: null,
              },
            ],
          },
        ],
      }),
    ).toThrow(/is not registered/);
  });

  it("rejects constraints that fail the action class schema", () => {
    expect(() =>
      validateManifest({
        ...validManifest(),
        default_standing_grants: [
          {
            ...validManifest().default_standing_grants![0],
            granted_capabilities: [
              {
                action_class: "test.notify",
                description: "x",
                constraints: { max_per_day: -1, channel: "dm" },
                rate_limit: null,
              },
            ],
          },
        ],
      }),
    ).toThrow(/failed the constraint_schema/);
  });

  it("rejects a rate_limit exceeding the action class default", () => {
    // class default is 100/day; default declares 200/day → exceed.
    expect(() =>
      validateManifest({
        ...validManifest(),
        default_standing_grants: [
          {
            ...validManifest().default_standing_grants![0],
            granted_capabilities: [
              {
                action_class: "test.notify",
                description: "x",
                constraints: { max_per_day: 1, channel: "dm" },
                rate_limit: { count: 200, window: "day" },
              },
            ],
          },
        ],
      }),
    ).toThrow(/exceeds the action class's rate_limit_default/);
  });

  it("rejects expires_at !== null on a default", () => {
    expect(() =>
      validateManifest({
        ...validManifest(),
        default_standing_grants: [
          {
            ...validManifest().default_standing_grants![0],
            // @ts-expect-error testing runtime guard for `as any` escapes
            expires_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    ).toThrow(/expires_at must be null/);
  });

  it("rejects a capability description containing 'Authority Grant'", () => {
    expect(() =>
      validateManifest({
        ...validManifest(),
        default_standing_grants: [
          {
            ...validManifest().default_standing_grants![0],
            granted_capabilities: [
              {
                action_class: "test.notify",
                description: "Use this Authority Grant to notify.",
                constraints: { max_per_day: 1, channel: "dm" },
                rate_limit: null,
              },
            ],
          },
        ],
      }),
    ).toThrow(/banned phrase "Authority Grant"/);
  });

  it("rejects a customer_template placeholder that constraints don't supply", () => {
    _resetActionClassRegistryForTests();
    registerActionClass(
      validClass({
        constraint_schema: z.object({ max_per_day: z.number().int().positive() }),
        // template references {channel} but the schema doesn't include it
        customer_template: "Send {channel} up to {max_per_day}.",
      }),
    );
    expect(() =>
      validateManifest({
        ...validManifest(),
        default_standing_grants: [
          {
            ...validManifest().default_standing_grants![0],
            granted_capabilities: [
              {
                action_class: "test.notify",
                description: "x",
                constraints: { max_per_day: 5 },
                rate_limit: null,
              },
            ],
          },
        ],
      }),
    ).toThrow(/customer_template references "channel" but/);
  });

  it("ManifestValidationError carries the [manifest-validator] prefix", () => {
    try {
      validateManifest({
        ...validManifest(),
        default_standing_grants: [
          {
            ...validManifest().default_standing_grants![0],
            key: "BadKey",
          },
        ],
      });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ManifestValidationError);
      expect((e as Error).message).toMatch(/^\[manifest-validator\]/);
    }
  });
});
