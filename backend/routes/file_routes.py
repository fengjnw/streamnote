from flask import jsonify, request

from file_processor import extract_text_from_file, validate_file


def register_file_routes(app, server_error_response):
    """Register file upload endpoints."""

    @app.route("/api/upload-file", methods=["POST"])
    def upload_file():
        try:
            if "file" not in request.files:
                return {"error": "No file part in the request"}, 400

            file = request.files["file"]
            validation = validate_file(file)
            if not validation["valid"]:
                return {"error": validation["error"]}, 400

            file.seek(0)
            result = extract_text_from_file(file)
            return jsonify(result), 200
        except ValueError as e:
            return {"error": str(e)}, 400
        except Exception as e:
            return server_error_response(e, "Server error: ")
