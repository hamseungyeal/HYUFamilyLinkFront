#!/bin/bash

echo ""
echo "========================================"
echo "  FamilyLink Frontend - 환경 설치"
echo "========================================"
echo ""

# Node.js 설치 확인
if ! command -v node &> /dev/null; then
    echo "[오류] Node.js가 설치되어 있지 않습니다."
    echo "https://nodejs.org 에서 설치 후 다시 실행해주세요."
    exit 1
fi

echo "[1/3] Node.js 확인 완료"
echo ""

# .env 파일 생성
if [ ! -f ".env" ]; then
    echo "[2/3] .env 파일 생성 중..."
    echo "VITE_API_URL=http://localhost:4000" > .env
    echo "VITE_SOCKET_URL=http://localhost:4000" >> .env
    echo "      .env 파일이 생성되었습니다."
    echo "      배포 시 실제 서버 주소로 변경하세요."
else
    echo "[2/3] .env 파일이 이미 존재합니다. 건너뜀."
fi
echo ""

# npm install
echo "[3/3] 패키지 설치 중..."
npm install
echo ""

echo "========================================"
echo "  설치 완료!"
echo "========================================"
echo ""
echo "  개발 서버 실행: ./start.sh"
echo ""
