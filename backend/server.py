from datetime import datetime, timedelta, timezone
import logging
import os
from pathlib import Path
from typing import Dict, List, Literal, Optional
import uuid

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError
from starlette.middleware.cors import CORSMiddleware


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="SES Asamblea - Votación en Vivo")
api_router = APIRouter(prefix="/api")

delegates_coll = db.delegates
admins_coll = db.admin_users
points_coll = db.agenda_points
votes_coll = db.votes

SECRET_KEY = "SES_ASAMBLEA_VOTACION_2026"
ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 600
DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "ses2026"

VOTE_CHOICES = ["aprobado", "no_aprobado", "abstencion", "en_blanco"]
VOTE_LABELS = {
    "aprobado": "Aprobado",
    "no_aprobado": "No aprobado",
    "abstencion": "Abstención",
    "en_blanco": "En blanco",
}

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_document(document_id: str) -> str:
    normalized = "".join(char for char in document_id.strip().upper() if char.isalnum())
    return normalized


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(payload: Dict[str, str]) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES)
    encoded_payload = {**payload, "exp": exp}
    return jwt.encode(encoded_payload, SECRET_KEY, algorithm=ALGORITHM)


class AuthUser(BaseModel):
    user_id: str
    role: Literal["delegate", "admin"]
    name: str


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> AuthUser:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token requerido")

    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido") from exc

    user_id = payload.get("sub")
    role = payload.get("role")
    name = payload.get("name")
    if not user_id or role not in {"delegate", "admin"} or not name:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    return AuthUser(user_id=user_id, role=role, name=name)


async def require_admin(current_user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo administrador")
    return current_user


async def require_delegate(current_user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if current_user.role != "delegate":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo delegados")
    return current_user


class DelegateUploadItem(BaseModel):
    full_name: str = Field(min_length=3, max_length=120)
    document_id: str = Field(min_length=4, max_length=40)


class DelegateUploadPayload(BaseModel):
    delegates: List[DelegateUploadItem]


class DelegateRegisterInput(BaseModel):
    document_id: str = Field(min_length=4, max_length=40)
    password: str = Field(min_length=6, max_length=40)


class DelegateLoginInput(BaseModel):
    document_id: str = Field(min_length=4, max_length=40)
    password: str = Field(min_length=6, max_length=40)


class AdminLoginInput(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=6, max_length=40)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Literal["delegate", "admin"]
    user_name: str


class UserProfile(BaseModel):
    id: str
    role: Literal["delegate", "admin"]
    display_name: str
    document_id: Optional[str] = None


class AgendaPointCreate(BaseModel):
    title: str = Field(min_length=6, max_length=220)
    description: str = Field(min_length=4, max_length=500)
    order: int = Field(ge=1, le=40)


class VoteCastInput(BaseModel):
    point_id: str
    choice: Literal["aprobado", "no_aprobado", "abstencion", "en_blanco"]


class MessageResponse(BaseModel):
    message: str


class UploadSummaryResponse(BaseModel):
    created: int
    updated: int
    total_in_padron: int


async def calculate_point_totals(point_id: str) -> Dict[str, int]:
    rows = await votes_coll.aggregate(
        [
            {"$match": {"point_id": point_id}},
            {"$group": {"_id": "$choice", "count": {"$sum": 1}}},
        ]
    ).to_list(length=20)

    totals = {choice: 0 for choice in VOTE_CHOICES}
    for row in rows:
        key = row.get("_id")
        if key in totals:
            totals[key] = int(row.get("count", 0))

    totals["total_votes"] = sum(totals[choice] for choice in VOTE_CHOICES)
    return totals


async def fetch_active_point() -> Optional[Dict]:
    return await points_coll.find_one({"status": "abierta"}, {"_id": 0}, sort=[("order", 1)])


async def ensure_default_admin() -> None:
    admin = await admins_coll.find_one({"username": DEFAULT_ADMIN_USERNAME}, {"_id": 0})
    if admin:
        return

    await admins_coll.insert_one(
        {
            "id": str(uuid.uuid4()),
            "username": DEFAULT_ADMIN_USERNAME,
            "password_hash": hash_password(DEFAULT_ADMIN_PASSWORD),
            "created_at": now_iso(),
        }
    )
    logger.info("Administrador por defecto creado")


@api_router.get("/")
async def root() -> Dict[str, str]:
    return {"message": "SES Votación en Vivo API"}


@api_router.get("/public/setup")
async def public_setup_info() -> Dict[str, str]:
    return {
        "admin_username": DEFAULT_ADMIN_USERNAME,
        "admin_password": DEFAULT_ADMIN_PASSWORD,
        "note": "Cambie la contraseña del administrador en una siguiente fase de seguridad.",
    }


@api_router.post("/auth/register-delegate", response_model=MessageResponse)
async def register_delegate(payload: DelegateRegisterInput) -> MessageResponse:
    document_id = normalize_document(payload.document_id)
    delegate = await delegates_coll.find_one({"document_id": document_id}, {"_id": 0})

    if not delegate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No aparece en el padrón de delegados cargado por la mesa directiva.",
        )

    if delegate.get("is_registered"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este delegado ya realizó su registro único.",
        )

    await delegates_coll.update_one(
        {"id": delegate["id"]},
        {
            "$set": {
                "is_registered": True,
                "password_hash": hash_password(payload.password),
                "registered_at": now_iso(),
            }
        },
    )
    return MessageResponse(message="Registro único completado. Ya puede iniciar sesión.")


@api_router.post("/auth/login-delegate", response_model=AuthResponse)
async def login_delegate(payload: DelegateLoginInput) -> AuthResponse:
    document_id = normalize_document(payload.document_id)
    delegate = await delegates_coll.find_one({"document_id": document_id}, {"_id": 0})

    if not delegate or not delegate.get("is_registered"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    if not verify_password(payload.password, delegate.get("password_hash", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    token = create_access_token(
        {"sub": delegate["id"], "role": "delegate", "name": delegate["full_name"]}
    )
    return AuthResponse(access_token=token, role="delegate", user_name=delegate["full_name"])


@api_router.post("/auth/login-admin", response_model=AuthResponse)
async def login_admin(payload: AdminLoginInput) -> AuthResponse:
    username = payload.username.strip().lower()
    admin = await admins_coll.find_one({"username": username}, {"_id": 0})

    if not admin or not verify_password(payload.password, admin.get("password_hash", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    token = create_access_token(
        {"sub": admin["id"], "role": "admin", "name": admin["username"]}
    )
    return AuthResponse(access_token=token, role="admin", user_name=admin["username"])


@api_router.get("/auth/me", response_model=UserProfile)
async def auth_me(current_user: AuthUser = Depends(get_current_user)) -> UserProfile:
    if current_user.role == "admin":
        admin = await admins_coll.find_one({"id": current_user.user_id}, {"_id": 0})
        if not admin:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
        return UserProfile(id=admin["id"], role="admin", display_name=admin["username"])

    delegate = await delegates_coll.find_one({"id": current_user.user_id}, {"_id": 0})
    if not delegate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delegado no encontrado")
    return UserProfile(
        id=delegate["id"],
        role="delegate",
        display_name=delegate["full_name"],
        document_id=delegate["document_id"],
    )


@api_router.post("/admin/delegates/upload", response_model=UploadSummaryResponse)
async def upload_delegates(
    payload: DelegateUploadPayload,
    _: AuthUser = Depends(require_admin),
) -> UploadSummaryResponse:
    if not payload.delegates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Debe enviar delegados")

    created = 0
    updated = 0
    for item in payload.delegates:
        document_id = normalize_document(item.document_id)
        if not document_id:
            continue

        existing_delegate = await delegates_coll.find_one({"document_id": document_id}, {"_id": 0})
        if existing_delegate:
            await delegates_coll.update_one(
                {"id": existing_delegate["id"]},
                {
                    "$set": {
                        "full_name": item.full_name.strip(),
                        "updated_at": now_iso(),
                    }
                },
            )
            updated += 1
            continue

        await delegates_coll.insert_one(
            {
                "id": str(uuid.uuid4()),
                "full_name": item.full_name.strip(),
                "document_id": document_id,
                "is_registered": False,
                "password_hash": "",
                "created_at": now_iso(),
            }
        )
        created += 1

    total_in_padron = await delegates_coll.count_documents({})
    return UploadSummaryResponse(created=created, updated=updated, total_in_padron=total_in_padron)


@api_router.get("/admin/delegates/summary")
async def delegates_summary(_: AuthUser = Depends(require_admin)) -> Dict[str, int]:
    total_in_padron = await delegates_coll.count_documents({})
    registered = await delegates_coll.count_documents({"is_registered": True})
    return {
        "total_in_padron": total_in_padron,
        "registrados": registered,
        "pendientes_registro": max(total_in_padron - registered, 0),
    }


@api_router.post("/admin/points", response_model=MessageResponse)
async def create_agenda_point(
    payload: AgendaPointCreate,
    _: AuthUser = Depends(require_admin),
) -> MessageResponse:
    existing_order = await points_coll.find_one({"order": payload.order}, {"_id": 0})
    if existing_order:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ya existe un punto con orden {payload.order}.",
        )

    point = {
        "id": str(uuid.uuid4()),
        "title": payload.title.strip(),
        "description": payload.description.strip(),
        "order": payload.order,
        "status": "pendiente",
        "created_at": now_iso(),
        "opened_at": None,
        "closed_at": None,
    }
    await points_coll.insert_one(point)
    return MessageResponse(message="Punto creado correctamente")


@api_router.get("/admin/points")
async def list_agenda_points(_: AuthUser = Depends(require_admin)) -> Dict[str, List[Dict]]:
    points = await points_coll.find({}, {"_id": 0}).sort("order", 1).to_list(length=100)
    enriched_points = []
    for point in points:
        totals = await calculate_point_totals(point["id"])
        enriched_points.append({
            **point,
            "results": totals,
        })
    return {"points": enriched_points}


@api_router.post("/admin/points/{point_id}/open", response_model=MessageResponse)
async def open_voting_point(point_id: str, _: AuthUser = Depends(require_admin)) -> MessageResponse:
    target = await points_coll.find_one({"id": point_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Punto no encontrado")

    await points_coll.update_many({"status": "abierta"}, {"$set": {"status": "cerrada", "closed_at": now_iso()}})
    await points_coll.update_one(
        {"id": point_id},
        {
            "$set": {
                "status": "abierta",
                "opened_at": now_iso(),
                "closed_at": None,
            }
        },
    )
    return MessageResponse(message="Punto abierto para votación en vivo")


@api_router.post("/admin/points/{point_id}/close", response_model=MessageResponse)
async def close_voting_point(point_id: str, _: AuthUser = Depends(require_admin)) -> MessageResponse:
    target = await points_coll.find_one({"id": point_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Punto no encontrado")

    await points_coll.update_one(
        {"id": point_id},
        {
            "$set": {
                "status": "cerrada",
                "closed_at": now_iso(),
            }
        },
    )
    return MessageResponse(message="Punto cerrado")


@api_router.get("/voting/active-point")
async def active_point_for_delegate(current_delegate: AuthUser = Depends(require_delegate)) -> Dict:
    point = await fetch_active_point()
    if not point:
        return {"has_active_point": False}

    totals = await calculate_point_totals(point["id"])
    my_vote = await votes_coll.find_one(
        {"point_id": point["id"], "delegate_id": current_delegate.user_id},
        {"_id": 0},
    )

    return {
        "has_active_point": True,
        "point": point,
        "has_voted": my_vote is not None,
        "my_vote": my_vote,
        "results": totals,
        "choice_labels": VOTE_LABELS,
    }


@api_router.post("/voting/vote", response_model=MessageResponse)
async def cast_vote(payload: VoteCastInput, current_delegate: AuthUser = Depends(require_delegate)) -> MessageResponse:
    active_point = await fetch_active_point()
    if not active_point:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No hay votación abierta")

    if payload.point_id != active_point["id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo puede votar el punto que está activo en este momento.",
        )

    vote_doc = {
        "id": str(uuid.uuid4()),
        "point_id": payload.point_id,
        "delegate_id": current_delegate.user_id,
        "choice": payload.choice,
        "choice_label": VOTE_LABELS[payload.choice],
        "voted_at": now_iso(),
    }

    try:
        await votes_coll.insert_one(vote_doc)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya votó este punto") from exc

    return MessageResponse(message=f"Voto registrado: {VOTE_LABELS[payload.choice]}")


@api_router.get("/voting/results/public")
async def public_results() -> Dict:
    points = await points_coll.find({}, {"_id": 0}).sort("order", 1).to_list(length=100)
    output = []
    for point in points:
        totals = await calculate_point_totals(point["id"])
        output.append(
            {
                **point,
                "results": totals,
            }
        )

    total_in_padron = await delegates_coll.count_documents({})
    registered = await delegates_coll.count_documents({"is_registered": True})
    return {
        "points": output,
        "choice_labels": VOTE_LABELS,
        "total_in_padron": total_in_padron,
        "registrados": registered,
    }


@api_router.get("/voting/results/directiva")
async def directiva_results(
    point_id: Optional[str] = Query(default=None),
    _: AuthUser = Depends(require_admin),
) -> Dict:
    if point_id:
        point = await points_coll.find_one({"id": point_id}, {"_id": 0})
    else:
        point = await fetch_active_point()
        if not point:
            point = await points_coll.find_one({}, {"_id": 0}, sort=[("order", -1)])

    if not point:
        return {"has_data": False, "message": "No hay puntos creados todavía"}

    totals = await calculate_point_totals(point["id"])
    votes = await votes_coll.find({"point_id": point["id"]}, {"_id": 0}).sort("voted_at", -1).to_list(1000)

    delegate_ids = [vote["delegate_id"] for vote in votes]
    delegates = await delegates_coll.find({"id": {"$in": delegate_ids}}, {"_id": 0}).to_list(1000)
    delegate_map = {delegate["id"]: delegate for delegate in delegates}

    vote_details = []
    for vote in votes:
        delegate = delegate_map.get(vote["delegate_id"], {})
        vote_details.append(
            {
                "delegate_id": vote["delegate_id"],
                "delegate_name": delegate.get("full_name", "No identificado"),
                "document_id": delegate.get("document_id", "N/A"),
                "choice": vote["choice"],
                "choice_label": vote["choice_label"],
                "voted_at": vote["voted_at"],
            }
        )

    total_in_padron = await delegates_coll.count_documents({})
    registered = await delegates_coll.count_documents({"is_registered": True})
    return {
        "has_data": True,
        "point": point,
        "totals": totals,
        "votes": vote_details,
        "choice_labels": VOTE_LABELS,
        "stats": {
            "total_in_padron": total_in_padron,
            "registrados": registered,
            "votaron_este_punto": totals["total_votes"],
        },
    }


@api_router.get("/live/state")
async def live_state() -> Dict:
    active_point = await fetch_active_point()
    points = await points_coll.find({}, {"_id": 0}).sort("order", 1).to_list(100)

    all_point_results = []
    for point in points:
        totals = await calculate_point_totals(point["id"])
        all_point_results.append({**point, "results": totals})

    total_in_padron = await delegates_coll.count_documents({})
    registered = await delegates_coll.count_documents({"is_registered": True})
    active_results = await calculate_point_totals(active_point["id"]) if active_point else None

    return {
        "active_point": active_point,
        "active_results": active_results,
        "choice_labels": VOTE_LABELS,
        "total_in_padron": total_in_padron,
        "registrados": registered,
        "all_points": all_point_results,
    }


@app.on_event("startup")
async def startup_event() -> None:
    await delegates_coll.create_index("document_id", unique=True)
    await delegates_coll.create_index("id", unique=True)
    await admins_coll.create_index("username", unique=True)
    await admins_coll.create_index("id", unique=True)
    await points_coll.create_index("id", unique=True)
    await points_coll.create_index("order", unique=True)
    await votes_coll.create_index("id", unique=True)
    await votes_coll.create_index([("point_id", 1), ("delegate_id", 1)], unique=True)
    await ensure_default_admin()


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client() -> None:
    client.close()