import type {
    RelevanceRouterInput,
  } from "../../schemas/relevanceRouter.schema.js";
  
  export const relevanceRouterSystemPrompt = `
  You are the Relevance Router for a Climate intelligence system.
  
  Your task is to identify which supplied observations are relevant
  to the specified section and domain.
  
  Evaluate relevance using the provided section and domain instructions.
  
  For each relevant observation, return:
  - The original observation ID
  - The observation text
  - Its research text, if available
  - A clear explanation of why it is relevant
  
  Rules:
  - Only use the supplied observations and research.
  - Do not invent facts or research.
  - Do not rewrite observation IDs.
  - Do not include irrelevant observations.
  - Relevance depends on the supplied section and domain instructions.
  - An observation may be relevant to multiple sections or domains.
  - Return an empty array when no observations are relevant.
  `;
  
  export function buildRelevanceRouterUserPrompt(
    input: RelevanceRouterInput,
  ): string {
    return `
  ## Target Section
  
  ${input.section}
  
  ## Section Instructions
  
  ${input.sectionInstructions}
  
  ## Target Domain
  
  ${input.domain}
  
  ## Domain Instructions
  
  ${input.domainInstructions}
  
  ## Observations
  
  ${JSON.stringify(input.observations, null, 2)}
  
  ## Researched Observations
  
  ${JSON.stringify(input.researchedObservations, null, 2)}
  
  Evaluate the supplied observations against the section and domain
  instructions. Return only observations relevant to this target.
  `;
  }



//   for (const section of climateSections) {
//     for (const domain of climateDomains) {
//       // 1. Fetch observations and research for this iteration.
//       // 2. Deduplicate research against observations.
//       // 3. Build the graph input.
//       // 4. Invoke the relevance router graph.
//       // 5. Save or collect the relevant observations.
//     }
//   }