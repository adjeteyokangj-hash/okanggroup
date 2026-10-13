import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleStaffRequest } from "./handler.ts";

Deno.serve((req) => handleStaffRequest(req));
