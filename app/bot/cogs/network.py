from __future__ import annotations

import logging

import discord
from discord import app_commands
from discord.ext import commands

from app.database import SessionLocal
from app.models import BanActionStatus, Guild, StaffRole
from app.services.global_bans import (
    execute_global_ban,
    execute_global_unban,
    format_summary,
    get_ban_info,
    sync_guild_bans,
)
from app.services.guilds import setup_guild
from app.services.permissions import (
    add_staff,
    can_execute_global_ban,
    can_manage_staff,
    can_setup_guild,
    can_view_ban_info,
    remove_staff,
)

logger = logging.getLogger(__name__)


class NetworkCog(commands.Cog):
    staff = app_commands.Group(name="staff", description="Verwaltet globale Moderatoren und Administratoren.")

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="setup", description="Verbindet diesen Server mit dem globalen Bann-Netzwerk.")
    @app_commands.describe(
        log_channel="Kanal für globale Ban-Logs",
        verbunden="Server mit dem Netzwerk verbinden (Standard: ja)",
        mods_koennen_bannen="Dürfen Mods globale Bans ausführen? (Standard: nein)",
    )
    async def setup(
        self,
        interaction: discord.Interaction,
        log_channel: discord.TextChannel,
        verbunden: bool = True,
        mods_koennen_bannen: bool = False,
    ) -> None:
        if interaction.guild is None or not isinstance(interaction.user, discord.Member):
            await interaction.response.send_message("Dieser Befehl funktioniert nur auf einem Server.", ephemeral=True)
            return

        is_admin = interaction.user.guild_permissions.administrator
        if not can_setup_guild(str(interaction.user.id), is_admin):
            await interaction.response.send_message(
                "Nur Discord-Administratoren oder der Bot-Owner können /setup ausführen.",
                ephemeral=True,
            )
            return

        await interaction.response.defer(ephemeral=True)
        try:
            async with SessionLocal() as session:
                await setup_guild(
                    session,
                    guild_id=str(interaction.guild.id),
                    name=interaction.guild.name,
                    owner_id=str(interaction.guild.owner_id or 0),
                    log_channel_id=str(log_channel.id),
                    is_connected_to_network=verbunden,
                    mod_can_execute_ban=mods_koennen_bannen,
                    admin_user_id=str(interaction.user.id),
                )
            status = (
                "Dieser Server ist mit dem globalen Bann-Netzwerk verbunden."
                if verbunden
                else "Dieser Server ist **nicht** mit dem Netzwerk verbunden."
            )
            await interaction.followup.send(
                "\n".join(
                    [
                        status,
                        f"Log-Kanal: {log_channel.mention}",
                        f"Mods dürfen globale Bans ausführen: **{'ja' if mods_koennen_bannen else 'nein'}**",
                        "Du wurdest als **ADMIN** für diesen Server hinterlegt.",
                    ]
                ),
                ephemeral=True,
            )
        except Exception:
            logger.exception("setup failed")
            await interaction.followup.send("Setup ist fehlgeschlagen. Prüfe die Datenbankverbindung.", ephemeral=True)

    @app_commands.command(name="globalban", description="Bannt einen Nutzer auf allen verbundenen Servern.")
    @app_commands.describe(user="Zu bannender Nutzer", grund="Grund für den globalen Ban")
    async def globalban(self, interaction: discord.Interaction, user: discord.User, grund: str) -> None:
        if interaction.guild is None:
            await interaction.response.send_message("Dieser Befehl funktioniert nur auf einem Server.", ephemeral=True)
            return
        async with SessionLocal() as session:
            allowed = await can_execute_global_ban(session, str(interaction.user.id), str(interaction.guild.id))
        if not allowed:
            await interaction.response.send_message(
                "Du darfst keine globalen Bans ausführen. Admins bzw. Mods (falls aktiviert) oder der Bot-Owner.",
                ephemeral=True,
            )
            return
        if self.bot.user and user.id == self.bot.user.id:
            await interaction.response.send_message("Der Bot kann sich nicht selbst bannen.", ephemeral=True)
            return
        if user.bot:
            await interaction.response.send_message("Bots können nicht global gebannt werden.", ephemeral=True)
            return

        await interaction.response.defer(ephemeral=True)
        try:
            async with SessionLocal() as session:
                _, summary = await execute_global_ban(
                    session,
                    self.bot,
                    user_id=str(user.id),
                    reason=grund[:512],
                    banned_by=str(interaction.user.id),
                )
            await interaction.followup.send(
                f"**{user}** (`{user.id}`) wurde global gebannt.\n{format_summary(summary)}",
                ephemeral=True,
            )
        except Exception:
            logger.exception("globalban failed")
            await interaction.followup.send("Der globale Ban ist fehlgeschlagen. Details stehen in den Logs.", ephemeral=True)

    @app_commands.command(name="globalunban", description="Hebt einen globalen Ban auf allen verbundenen Servern auf.")
    @app_commands.describe(user="Zu entbannender Nutzer")
    async def globalunban(self, interaction: discord.Interaction, user: discord.User) -> None:
        if interaction.guild is None:
            await interaction.response.send_message("Dieser Befehl funktioniert nur auf einem Server.", ephemeral=True)
            return
        async with SessionLocal() as session:
            allowed = await can_execute_global_ban(session, str(interaction.user.id), str(interaction.guild.id))
        if not allowed:
            await interaction.response.send_message("Du darfst keine globalen Unbans ausführen.", ephemeral=True)
            return

        await interaction.response.defer(ephemeral=True)
        try:
            async with SessionLocal() as session:
                ban, summary = await execute_global_unban(
                    session,
                    self.bot,
                    user_id=str(user.id),
                    executed_by=str(interaction.user.id),
                )
            if ban is None:
                await interaction.followup.send(f"Für **{user}** existiert kein globaler Ban.", ephemeral=True)
                return
            if not ban.is_active and summary.success == 0 and summary.failed == 0 and summary.skipped == 0:
                await interaction.followup.send(f"**{user}** ist bereits nicht mehr global gebannt.", ephemeral=True)
                return
            await interaction.followup.send(
                f"**{user}** (`{user.id}`) wurde global entbannt.\n{format_summary(summary)}",
                ephemeral=True,
            )
        except Exception:
            logger.exception("globalunban failed")
            await interaction.followup.send("Der globale Unban ist fehlgeschlagen. Details stehen in den Logs.", ephemeral=True)

    @app_commands.command(name="baninfo", description="Zeigt Status und Grund eines globalen Bans.")
    @app_commands.describe(user="Nutzer, dessen Ban-Status geprüft werden soll")
    async def baninfo(self, interaction: discord.Interaction, user: discord.User) -> None:
        if interaction.guild is None:
            await interaction.response.send_message("Dieser Befehl funktioniert nur auf einem Server.", ephemeral=True)
            return
        async with SessionLocal() as session:
            allowed = await can_view_ban_info(session, str(interaction.user.id), str(interaction.guild.id))
            if not allowed:
                await interaction.response.send_message(
                    "Nur Staff (Admin/Mod) und der Bot-Owner können Ban-Infos einsehen.",
                    ephemeral=True,
                )
                return
            await interaction.response.defer(ephemeral=True)
            try:
                ban = await get_ban_info(session, str(user.id))
            except Exception:
                logger.exception("baninfo failed")
                await interaction.followup.send("Ban-Info konnte nicht geladen werden.", ephemeral=True)
                return

        if ban is None:
            await interaction.followup.send(f"Für **{user}** ist kein globaler Ban hinterlegt.", ephemeral=True)
            return

            actions = sorted(ban.actions, key=lambda action: action.created_at, reverse=True)[:50]
            success = sum(1 for action in actions if action.status == BanActionStatus.SUCCESS)
            failed = sum(1 for action in actions if action.status == BanActionStatus.FAILED)
            skipped = sum(1 for action in actions if action.status == BanActionStatus.SKIPPED)
        embed = discord.Embed(title=f"Global Ban · {user}", color=0xED4245 if ban.is_active else 0x57F287)
        embed.add_field(name="Status", value="Aktiv" if ban.is_active else "Aufgehoben", inline=True)
        embed.add_field(name="User-ID", value=f"`{ban.user_id}`", inline=True)
        embed.add_field(name="Ausgeführt von", value=f"<@{ban.banned_by}>", inline=True)
        embed.add_field(name="Grund", value=ban.reason[:1024], inline=False)
        embed.add_field(name="Aktionen (letzte 50)", value=f"Erfolgreich: {success} · Fehlgeschlagen: {failed} · Übersprungen: {skipped}")
        await interaction.followup.send(embed=embed, ephemeral=True)

    @app_commands.command(name="syncbans", description="Wendet alle aktiven globalen Bans auf diesen Server an.")
    async def syncbans(self, interaction: discord.Interaction) -> None:
        if interaction.guild is None:
            await interaction.response.send_message("Dieser Befehl funktioniert nur auf einem Server.", ephemeral=True)
            return
        async with SessionLocal() as session:
            allowed = await can_manage_staff(session, str(interaction.user.id), str(interaction.guild.id))
            guild = await session.get(Guild, str(interaction.guild.id))
        if not allowed:
            await interaction.response.send_message(
                "Nur Admins und der Bot-Owner können den Ban-Sync starten.",
                ephemeral=True,
            )
            return
        if guild is None or not guild.is_connected_to_network:
            await interaction.response.send_message(
                "Dieser Server ist nicht mit dem Netzwerk verbunden. Führe zuerst /setup aus.",
                ephemeral=True,
            )
            return

        await interaction.response.defer(ephemeral=True)
        try:
            async with SessionLocal() as session:
                summary = await sync_guild_bans(session, self.bot, str(interaction.guild.id))
            await interaction.followup.send(f"Sync abgeschlossen.\n{format_summary(summary)}", ephemeral=True)
        except Exception:
            logger.exception("syncbans failed")
            await interaction.followup.send("Sync ist fehlgeschlagen.", ephemeral=True)

    @staff.command(name="add", description="Weist einem Nutzer eine Staff-Rolle zu.")
    @app_commands.describe(user="Nutzer", rolle="Staff-Rolle")
    @app_commands.choices(
        rolle=[
            app_commands.Choice(name="Administrator", value="ADMIN"),
            app_commands.Choice(name="Moderator", value="MOD"),
        ]
    )
    async def staff_add(
        self, interaction: discord.Interaction, user: discord.User, rolle: app_commands.Choice[str]
    ) -> None:
        if interaction.guild is None:
            await interaction.response.send_message("Dieser Befehl funktioniert nur auf einem Server.", ephemeral=True)
            return
        async with SessionLocal() as session:
            allowed = await can_manage_staff(session, str(interaction.user.id), str(interaction.guild.id))
            if not allowed:
                await interaction.response.send_message(
                    "Nur Admins und der Bot-Owner können Staff verwalten.",
                    ephemeral=True,
                )
                return
            await interaction.response.defer(ephemeral=True)
            try:
                await add_staff(session, str(interaction.guild.id), str(user.id), StaffRole(rolle.value))
                await interaction.followup.send(
                    f"**{user}** ist jetzt **{rolle.value}** auf diesem Server.",
                    ephemeral=True,
                )
            except Exception:
                logger.exception("staff add failed")
                await interaction.followup.send("Staff-Änderung ist fehlgeschlagen.", ephemeral=True)

    @staff.command(name="remove", description="Entfernt die Staff-Rolle eines Nutzers.")
    @app_commands.describe(user="Nutzer")
    async def staff_remove(self, interaction: discord.Interaction, user: discord.User) -> None:
        if interaction.guild is None:
            await interaction.response.send_message("Dieser Befehl funktioniert nur auf einem Server.", ephemeral=True)
            return
        async with SessionLocal() as session:
            allowed = await can_manage_staff(session, str(interaction.user.id), str(interaction.guild.id))
            if not allowed:
                await interaction.response.send_message(
                    "Nur Admins und der Bot-Owner können Staff verwalten.",
                    ephemeral=True,
                )
                return
            await interaction.response.defer(ephemeral=True)
            try:
                await remove_staff(session, str(interaction.guild.id), str(user.id))
                await interaction.followup.send(f"Staff-Eintrag für **{user}** wurde entfernt.", ephemeral=True)
            except Exception:
                logger.exception("staff remove failed")
                await interaction.followup.send("Staff-Änderung ist fehlgeschlagen.", ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(NetworkCog(bot))
