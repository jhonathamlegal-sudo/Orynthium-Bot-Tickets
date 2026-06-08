module.exports = {
  DEFAULTS: {
    AUTO_CLOSE_MINUTES: 35,
    TRANSCRIPTS_ENABLED: 1,
  },

  FOOTER_TEXT: 'Orynthium Atrium: Tickets • 𝐣𝐡𝐨-𝐜𝐲𝐛𝐞𝐫 𝐬𝐜𝐫𝐢𝐩𝐭𝐬',

  CATEGORIES: {
    duvidas: {
      label: 'Dúvidas',
      emoji: '🔎',
      color: 0x38bdf8,
      intro: 'Você abriu um ticket de **Dúvidas**. Explique seu problema com detalhes para a equipe ajudar com precisão.',
      description: 'Dúvidas sobre scripts e funcionalidades',
    },
    denuncia: {
      label: 'Denúncia',
      emoji: '❌',
      color: 0xef4444,
      intro: 'Você abriu um ticket de **Denúncia**. Envie contexto, links e provas se houver, para análise da equipe.',
      description: 'Reportar um membro por quebra de regras',
    },
    parceria: {
      label: 'Parceria',
      emoji: '🤝',
      color: 0xa855f7,
      intro: 'Você abriu um ticket de **Parceria**. Envie os dados da parceria e o formato que deseja combinar.',
      description: 'Parceria com o nosso servidor',
    },
    outros: {
      label: 'Outros',
      emoji: '⚙️',
      color: 0xf59e0b,
      intro: 'Você abriu um ticket de **Outros**. Escreva sua solicitação com clareza para que a equipe direcione o atendimento.',
      description: 'Assuntos que não se encaixam acima',
    },
  },
};
