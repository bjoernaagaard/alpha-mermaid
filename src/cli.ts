#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";

import { runCli } from "./cli-command.ts";

runCli().pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
