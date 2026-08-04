from aip import AipOcr
from app.config import settings


class BaiduOCRService:
    """Baidu OCR Service"""

    def __init__(self):
        self.client = AipOcr(
            settings.BAIDU_APP_ID,
            settings.BAIDU_API_KEY,
            settings.BAIDU_SECRET_KEY
        )

    def recognize_text(self, image_path: str) -> dict:
        """Recognize text from image"""
        with open(image_path, 'rb') as f:
            image = f.read()

        result = self.client.basicGeneral(image)
        return result

    def recognize_accurate_text(self, image_path: str) -> dict:
        """Recognize text with higher accuracy"""
        with open(image_path, 'rb') as f:
            image = f.read()

        result = self.client.basicAccurate(image)
        return result


ocr_service = BaiduOCRService()
