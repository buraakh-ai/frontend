// Load balancer health check. Stays public when sign-in is on (see src/proxy.ts),
// so point the ALB target group's health check here.
export function GET() {
  return Response.json({ ok: true });
}
