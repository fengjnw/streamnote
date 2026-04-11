from app_factory import create_app
from config import FLASK_CONFIG


app = create_app()


if __name__ == "__main__":
    app.run(
        host=FLASK_CONFIG["host"],
        port=FLASK_CONFIG["port"],
        debug=FLASK_CONFIG["debug"],
    )
