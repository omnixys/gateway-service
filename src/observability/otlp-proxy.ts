export async function forwardOtlpTraces(
  collectorEndpoint: string,
  body: unknown,
  contentType: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  return fetcher(`${collectorEndpoint}/v1/traces`, {
    method: 'POST',
    headers: contentType ? { 'content-type': contentType } : {},
    body: JSON.stringify(body),
  });
}
