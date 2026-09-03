import { HttpResponse, http } from "msw";
import { TEST_API_URL } from "./render";

/** Handlers that speak the tRPC HTTP wire format for the unbatched `httpLink` used in tests. */
export const trpcMock = {
  query<T>(path: string, data: T | ((input: unknown) => T)) {
    return http.get(`${TEST_API_URL}/${path}`, ({ request }) => {
      const raw = new URL(request.url).searchParams.get("input");
      const input = raw ? JSON.parse(raw) : undefined;
      return HttpResponse.json({
        result: { data: typeof data === "function" ? (data as (i: unknown) => T)(input) : data },
      });
    });
  },
  mutation<T>(path: string, handler: (input: unknown) => T | Promise<T>) {
    return http.post(`${TEST_API_URL}/${path}`, async ({ request }) => {
      const input = (await request.json()) as unknown;
      return HttpResponse.json({ result: { data: await handler(input) } });
    });
  },
  error(
    path: string,
    code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "INTERNAL_SERVER_ERROR",
    status = 500,
  ) {
    return http.all(`${TEST_API_URL}/${path}`, () =>
      HttpResponse.json(
        { error: { message: code, code: -32603, data: { code, httpStatus: status } } },
        { status },
      ),
    );
  },
};
