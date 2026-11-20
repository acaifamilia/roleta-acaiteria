 
const PREMIOS = [
  { nome: "10% de desconto", peso: 10 },
  { nome: "Açaí pequeno grátis", peso: 10 },
  { nome: "Adicional grátis", peso: 10 },
  { nome: "R$ 5 de desconto", peso: 10 },
  { nome: "Fruta grátis", peso: 10 },
  { nome: "Entrega grátis", peso: 10 },
  { nome: "R$ 5 de desconto", peso: 10 },
  { nome: "R$ 10 de desconto", peso: 10 },
  { nome: "Entrega grátis", peso: 10 },
  { nome: "Tente novamente", peso: 10 }
];

function resposta(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function gerarCodigo() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const valores = crypto.getRandomValues(new Uint8Array(6));

  return "ACAI-" + Array.from(
    valores,
    n => letras[n % letras.length]
  ).join("");
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

  return btoa(
    String.fromCharCode(...new Uint8Array(assinatura))
  );
}

async function autenticar(request, env) {
  const autorizacao = request.headers.get("Authorization") || "";

  if (!autorizacao.startsWith("Bearer ")) {
    return false;
  }

  if (!env.SESSION_SECRET) {
    return false;
  }

  const token = autorizacao.slice(7);
  const partes = token.split(".");

  if (partes.length !== 2) {
    return false;
  }

  const [expiracao, assinatura] = partes;
  const tempo = Number(expiracao);

  if (
    !Number.isSafeInteger(tempo) ||
    tempo <= Date.now()
  ) {
    return false;
  }

  const esperada = await assinar(
    expiracao,
    env.SESSION_SECRET
  );

  const a = new TextEncoder().encode(assinatura);
  const b = new TextEncoder().encode(esperada);

  if (a.length !== b.length) {
    return false;
  }

  let diferenca = 0;

  for (let i = 0; i < a.length; i++) {
    diferenca |= a[i] ^ b[i];
  }

  return diferenca === 0;
}

function sortearPremio() {
  const total = PREMIOS.reduce(
    (soma, premio) => soma + premio.peso,
    0
  );

  const aleatorio =
    crypto.getRandomValues(new Uint32Array(1))[0] /
    4294967296;

  const numero = aleatorio * total;
  let acumulado = 0;

  for (const premio of PREMIOS) {
    acumulado += premio.peso;

    if (numero < acumulado) {
      return premio.nome;
    }
  }

  return PREMIOS[PREMIOS.length - 1].nome;
}

function mesValido(mes) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes || "")) {
    return false;
  }

  return true;
}

function periodoMes(mes) {
  const [ano, numeroMes] = mes.split("-").map(Number);

  const inicio = mes + "-01 00:00:00";

  const proximo = new Date(
    Date.UTC(ano, numeroMes, 1)
  );

  const fim =
    proximo.getUTCFullYear() + "-" +
    String(proximo.getUTCMonth() + 1).padStart(2, "0") +
    "-01 00:00:00";

  return { inicio, fim };
}

async function lerJSON(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const caminho = url.pathname;
    const metodo = request.method;

    try {
      // VERIFICAR FUNCIONAMENTO
      if (
        metodo === "GET" &&
        caminho === "/api/status"
      ) {
        return resposta({
          funcionando: true,
          sistema: "Açaí da Família Castro"
        });
      }

      // LOGIN ADMINISTRATIVO
      if (
        metodo === "POST" &&
        caminho === "/api/admin/login"
      ) {
        const dados = await lerJSON(request);

        if (!dados || typeof dados.senha !== "string") {
          return resposta({
            erro: "Informe sua senha."
          }, 400);
        }

        if (
          !env.ADMIN_PASSWORD ||
          dados.senha !== env.ADMIN_PASSWORD
        ) {
          return resposta({
            erro: "Senha incorreta"
          }, 401);
        }

        if (!env.SESSION_SECRET) {
          return resposta({
            erro: "Configuração de sessão ausente."
          }, 500);
        }

        const expiracao = String(
          Date.now() + 8 * 60 * 60 * 1000
        );

        const assinatura = await assinar(
          expiracao,
          env.SESSION_SECRET
        );

        return resposta({
          token: expiracao + "." + assinatura
        });
      }

      // PROTEGER TODAS AS ROTAS ADMINISTRATIVAS
      if (caminho.startsWith("/api/admin/")) {
        const autorizado = await autenticar(
          request,
          env
        );

        if (!autorizado) {
          return resposta({
            erro: "Acesso não autorizado."
          }, 401);
        }
      }

      // CADASTRAR CLIENTE E REGISTRAR VENDA
      if (
        metodo === "POST" &&
        caminho === "/api/admin/clientes"
      ) {
        const dados = await lerJSON(request);

        if (!dados) {
          return resposta({
            erro: "Dados inválidos."
          }, 400);
        }

        const nome = typeof dados.nome === "string"
          ? dados.nome.trim()
          : "";

        const telefone = typeof dados.telefone === "string"
          ? dados.telefone.trim()
          : "";

        const valor = dados.valor_centavos;

        if (!nome || !telefone) {
          return resposta({
            erro: "Informe nome e telefone."
          }, 400);
        }

        if (
          !Number.isSafeInteger(valor) ||
          valor <= 0
        ) {
          return resposta({
            erro: "Informe um valor de compra válido."
          }, 400);
        }

        // Gera um código único antes de registrar.
        let codigo = "";
        let codigoDisponivel = false;

        for (let tentativa = 0; tentativa < 10; tentativa++) {
          codigo = gerarCodigo();

          const existente = await env.DB.prepare(
            "SELECT id FROM codigos WHERE codigo = ?"
          ).bind(codigo).first();

          if (!existente) {
            codigoDisponivel = true;
            break;
          }
        }

        if (!codigoDisponivel) {
          return resposta({
            erro: "Não foi possível gerar um código único."
          }, 500);
        }

        // Cria cliente e obtém seu ID.
        const cliente = await env.DB.prepare(
          `INSERT INTO clientes (nome, telefone)
           VALUES (?, ?)
           RETURNING id`
        ).bind(nome, telefone).first();

        if (!cliente || !cliente.id) {
          return resposta({
            erro: "Não foi possível cadastrar o cliente."
          }, 500);
        }

        // As duas operações são executadas
        // em uma transação do D1.
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO codigos (codigo, cliente_id)
             VALUES (?, ?)`
          ).bind(codigo, cliente.id),

          env.DB.prepare(
            `INSERT INTO vendas
             (cliente_id, valor_centavos)
             VALUES (?, ?)`
          ).bind(cliente.id, valor)
        ]);

        return resposta({
          sucesso: true,
          codigo,
          cliente_id: cliente.id,
          valor_centavos: valor
        });
      }

      // LISTAR CLIENTES
      if (
        metodo === "GET" &&
        caminho === "/api/admin/clientes"
      ) {
        const resultado = await env.DB.prepare(`
          SELECT
            clientes.id,
            clientes.nome,
            clientes.telefone,
            codigos.codigo,
            codigos.usado,
            codigos.premio
          FROM clientes
          LEFT JOIN codigos
            ON codigos.cliente_id = clientes.id
          ORDER BY clientes.id DESC
          LIMIT 500
        `).all();

        return resposta(resultado.results || []);
      }

      // RESUMO FINANCEIRO MENSAL
      if (
        metodo === "GET" &&
        caminho === "/api/admin/resumo"
      ) {
        const mes = url.searchParams.get("mes");

        if (!mesValido(mes)) {
          return resposta({
            erro: "Selecione um mês válido."
          }, 400);
        }

        const { inicio, fim } = periodoMes(mes);

        const resumo = await env.DB.prepare(`
          SELECT
            COALESCE(SUM(valor_centavos), 0)
              AS total_centavos,
            COUNT(*) AS total_vendas,
            COUNT(DISTINCT cliente_id)
              AS total_clientes
          FROM vendas
          WHERE criado_em >= ?
            AND criado_em < ?
        `).bind(inicio, fim).first();

        return resposta({
          total_centavos: Number(
            resumo?.total_centavos || 0
          ),
          total_vendas: Number(
            resumo?.total_vendas || 0
          ),
          total_clientes: Number(
            resumo?.total_clientes || 0
          )
        });
      }

      // HISTÓRICO DE VENDAS DO MÊS
      if (
        metodo === "GET" &&
        caminho === "/api/admin/vendas"
      ) {
        const mes = url.searchParams.get("mes");

        if (!mesValido(mes)) {
          return resposta({
            erro: "Selecione um mês válido."
          }, 400);
        }

        const { inicio, fim } = periodoMes(mes);

        const resultado = await env.DB.prepare(`
          SELECT
            vendas.id,
            vendas.valor_centavos,
            vendas.criado_em AS data_venda,
            clientes.nome,
            clientes.telefone
          FROM vendas
          INNER JOIN clientes
            ON clientes.id = vendas.cliente_id
          WHERE vendas.criado_em >= ?
            AND vendas.criado_em < ?
          ORDER BY vendas.criado_em DESC,
                   vendas.id DESC
          LIMIT 500
        `).bind(inicio, fim).all();

        return resposta(resultado.results || []);
      }

      // GIRAR A ROLETA
      if (
        metodo === "POST" &&
        caminho === "/api/roleta/girar"
      ) {
        const dados = await lerJSON(request);

        const codigo = typeof dados?.codigo === "string"
          ? dados.codigo.trim().toUpperCase()
          : "";

        if (!codigo) {
          return resposta({
            erro: "Digite seu código."
          }, 400);
        }

        const premio = sortearPremio();

        const resultado = await env.DB.prepare(`
          UPDATE codigos
          SET
            usado = 1,
            premio = ?,
            usado_em = CURRENT_TIMESTAMP
          WHERE codigo = ?
            AND usado = 0
          RETURNING premio
        `).bind(premio, codigo).first();

        if (!resultado) {
          return resposta({
            erro: "Código inválido ou já utilizado"
          }, 400);
        }

        return resposta({
          sucesso: true,
          premio: resultado.premio
        });
      }

      // OUTRAS ROTAS DE API
      if (caminho.startsWith("/api/")) {
        return resposta({
          erro: "Rota não encontrada."
        }, 404);
      }

      // PÁGINAS DO SITE
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return resposta({
        erro: "Arquivos do site não configurados."
      }, 500);

    } catch (erro) {
      console.error("Erro no Worker:", erro);

      return resposta({
        erro: "Erro interno do servidor. Verifique os logs."
      }, 500);
    }
  }
};
