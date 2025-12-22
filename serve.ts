Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname === "/" ? "/index.html" : url.pathname;

    // Handle PUT to save world.json
    if (req.method === "PUT" && path === "/world.json") {
      const body = await req.text();
      await Bun.write("./world.json", body);
      console.log("Saved world.json");
      return new Response("OK", { status: 200 });
    }

    const file = Bun.file("." + path);
    const headers = new Headers();

    // Disable caching for development hot-reload
    headers.set("Cache-Control", "no-store");

    return new Response(file, { headers });
  },
});

console.log("Server running at http://localhost:3000 (hot-reload enabled - just refresh)");
