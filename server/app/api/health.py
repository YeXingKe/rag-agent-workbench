from flask import jsonify
from app.api import api_bp


@api_bp.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'message': 'Server is running'
    }), 200
