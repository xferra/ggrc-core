# Copyright (C) 2016 Google Inc.
# Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>

"""Main ggrc entry point."""

from ggrc.app import app

host = app.config.get("HOST") or "0.0.0.0"
port = app.config.get("PORT") or 8080

# from werkzeug.contrib.profiler import ProfilerMiddleware
# app.config['PROFILE'] = True
# app.wsgi_app = ProfilerMiddleware(app.wsgi_app, restrictions=[60])
app.run(host=host, port=port)
