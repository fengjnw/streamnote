from flask import send_from_directory


def register_static_routes(app):
    """Register frontend static file routes."""

    @app.route("/", methods=["GET"])
    def index():
        return send_from_directory("../frontend", "index.html")

    @app.route("/<path:path>", methods=["GET"])
    def serve_static(path):
        return send_from_directory("../frontend", path)
