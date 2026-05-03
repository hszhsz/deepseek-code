import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./fim.txt"
import { InstanceState } from "@/effect/instance-state"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import path from "path"
import { Env } from "@/env"

const Parameters = Schema.Struct({
  file_path: Schema.String.annotate({
    description: "The absolute path to the file to complete code in",
  }),
  line: Schema.Finite.annotate({
    description: "The 1-indexed line number where completion should occur",
  }),
  column: Schema.Finite.annotate({
    description: "The 1-indexed column number where completion should occur",
  }),
})

export const FIMTool = Tool.define(
  "fim_complete",
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service
    const env = yield* Env.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context

          // Resolve file path
          const filePath = path.isAbsolute(params.file_path)
            ? params.file_path
            : path.resolve(instance.directory, params.file_path)

          // Read file content
          const content = yield* fs.readFileString(filePath)
          const lines = content.split("\n")

          // Validate line number
          const lineIndex = Math.max(0, Math.min(params.line - 1, lines.length - 1))
          const colIndex = Math.max(0, params.column - 1)

          // Split content into prefix and suffix at cursor position
          const prefixLines = lines.slice(0, lineIndex)
          const currentLine = lines[lineIndex] || ""
          const prefixPart = currentLine.slice(0, colIndex)
          const suffixPart = currentLine.slice(colIndex)
          const suffixLines = lines.slice(lineIndex + 1)

          const prefix = [...prefixLines, prefixPart].join("\n")
          const suffix = [suffixPart, ...suffixLines].join("\n")

          // Get API key from environment
          const apiKey = yield* env.get("DEEPSEEK_API_KEY")

          if (!apiKey) {
            return {
              title: "FIM Completion",
              output:
                "Error: DEEPSEEK_API_KEY is not set. Please set it to use FIM completion.",
              metadata: { error: true },
            }
          }

          // Call DeepSeek FIM API
          const response = yield* Effect.tryPromise({
            try: async () => {
              const res = await fetch(
                "https://api.deepseek.com/beta/completions",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                  },
                  body: JSON.stringify({
                    model: "deepseek-v4-flash",
                    prompt: prefix,
                    suffix: suffix,
                    max_tokens: 4096,
                    temperature: 0,
                    stop: ["\n\n\n"],
                  }),
                },
              )

              if (!res.ok) {
                const errorText = await res.text()
                throw new Error(
                  `DeepSeek API error (${res.status}): ${errorText}`,
                )
              }

              return res.json()
            },
            catch: (error) => new Error(`FIM API call failed: ${error}`),
          })

          const completion =
            (response as any)?.choices?.[0]?.text ?? ""

          return {
            title: `FIM completion at ${path.basename(filePath)}:${params.line}:${params.column}`,
            output: completion || "(empty completion)",
            metadata: {
              file: filePath,
              line: params.line,
              column: params.column,
              completionLength: completion.length,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
