
const PREMIOS = [
  "10% de desconto",
  "Açaí pequeno grátis",
  "Adicional grátis",
  "R$ 5 de desconto",
  "Tente novamente"
];

function resposta(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function gerarCodigo() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const valores = crypto.getRandomValues(new Uint8Array(6));
  return "ACAI-" + Array.from(valores, n => letras[n % letras.length]).join("");
}

async function assinar(texto, segredo) {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const assinatura = await crypto.subtle.sign(
    "HMAC",
    chave,
    new TextEncoder().encode(texto)
  );
  return btoa(String.fromCharCode(...new Uint8Array(assinatura)));
}

async function autenticar(request, env) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token || !env.SESSION_SECRET) return false;

  const partes = token.split(".");
  if (partes.length !== 2) return false;

  const [expiracao, assinatura] = partes;
  if (Number(expiracao) < Date.now()) return false;

  const esperada = await assinar(expiracao, env.SESSION_SECRET);
  return assinatura === esperada;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/status") {
      return resposta({ funcionando: true });
    }

    if (request.method === "POST" && url.pathname === "/api/admin/login") {
      const { senha } = await request.json();

      if (!env.ADMIN_PASSWORD || senha !== env.ADMIN_PASSWORD) {
        return resposta({ erro: "Senha incorreta" }, 401);
      }

      const expiracao = String(Date.now() + 8 * 60 * 60 * 1000);
      const assinatura = await assinar(expiracao, env.SESSION_SECRET);

      return resposta({ token: expiracao + "." + assinatura });
    }

    if (url.pathname.startsWith("/api/admin/")) {
      if (!(await autenticar(request, env))) {
        return resposta({ erro: "Acesso não autorizado" }, 401);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/clientes") {
      const { nome, telefone } = await request.json();

      if (!nome?.trim() || !telefone?.trim()) {
        return resposta({ erro: "Informe nome e telefone" }, 400);
      }

      const cliente = await env.DB.prepare(
        "INSERT INTO clientes (nome, telefone) VALUES (?, ?) RETURNING id"
      ).bind(nome.trim(), telefone.trim()).first();

      let codigo;
      for (let i = 0; i < 5; i++) {
        codigo = gerarCodigo();
        try {
          await env.DB.prepare(
            "INSERT INTO codigos (codigo, cliente_id) VALUES (?, ?)"
          ).bind(codigo, cliente.id).run();
          break;
        } catch (erro) {
          codigo = null;
        }
      }

      if (!codigo) {
        return resposta({ erro: "Não foi possível gerar o código" }, 500);
      }

      return resposta({ sucesso: true, codigo, cliente_id: cliente.id });
    }

    if (request.method === "GET" && url.pathname === "/api/admin/clientes") {
      const resultado = await env.DB.prepare(`
        SELECT clientes.id, clientes.nome, clientes.telefone,
               codigos.codigo, codigos.usado, codigos.premio
        FROM clientes
        LEFT JOIN codigos ON codigos.cliente_id = clientes.id
        ORDER BY clientes.id DESC
      `).all();

      return resposta(resultado.results);
    }

    if (request.method === "POST" && url.pathname === "/api/roleta/girar") {
      const { codigo } = await request.json();

      if (!codigo) return resposta({ erro: "Digite seu código" }, 400);

      const premio = PREMIOS[
        crypto.getRandomValues(new Uint32Array(1))[0] % PREMIOS.length
      ];

      const resultado = await env.DB.prepare(`
        UPDATE codigos
        SET usado = 1, premio = ?, usado_em = CURRENT_TIMESTAMP
        WHERE codigo = ? AND usado = 0
        RETURNING premio
      `).bind(premio, codigo.trim().toUpperCase()).first();

      if (!resultado) {
        return resposta({
          erro: "Código inválido ou já utilizado"
        }, 400);
      }

      return resposta({ sucesso: true, premio: resultado.premio });
    }

     return env.ASSETS.fetch(request);
  }
};
  }
};
