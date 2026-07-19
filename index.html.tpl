<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vibe Loops</title>
  <link rel="stylesheet" href="vibe-loops.css">
</head>
<body>
  <div id="root"></div>

  <!-- Vendored runtime libraries (classic UMD scripts, SRI-pinned) -->
  <script src="lib/react.production.min.js" integrity="sha384-@@SRI:lib/react.production.min.js@@"></script>
  <script src="lib/react-dom.production.min.js" integrity="sha384-@@SRI:lib/react-dom.production.min.js@@"></script>
  <script src="lib/sql-wasm.js" integrity="sha384-@@SRI:lib/sql-wasm.js@@"></script>
  <script src="lib/lame.min.js" integrity="sha384-@@SRI:lib/lame.min.js@@"></script>

  <!-- Loader must come after the UMD libs (they sniff define.amd) -->
  <script src="lib/mini-amd.js" integrity="sha384-@@SRI:lib/mini-amd.js@@"></script>

  <!-- Application bundle (tsc --module amd --outFile) -->
  <script src="vibe-loops.js" integrity="sha384-@@SRI:vibe-loops.js@@"></script>
  <script>VibeLoopsLoader.require('index');</script>
</body>
</html>
