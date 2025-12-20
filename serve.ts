Bun.serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname === "/" ? "/index.html" : url.pathname;

    const file = Bun.file("." + path);
    const headers = new Headers();

    // Disable caching for development hot-reload
    headers.set("Cache-Control", "no-store");

    return new Response(file, { headers });
  },
});

console.log("Server running at http://localhost:3000 (hot-reload enabled - just refresh)");
